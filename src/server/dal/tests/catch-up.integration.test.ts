import { Client } from "pg";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { route } from "../../api/route";
import { signedInUser } from "../../auth/tests/sessions";
import { GOLDEN_NOW, insertRow, PRIVATE_ROWS } from "../../db/tests/private-rows";
import { parseOwnerEnv, serverEnv } from "../../env";
import { DAILY_PASS_STEPS, runDailyPassIfDue } from "../../system/daily-pass";
import {
	CATCH_UP_STEPS,
	type CatchUpRun,
	catchUpDone,
	clearCatchUpNote,
	resetCatchUpNote,
	runCatchUpIfDue,
} from "../catch-up";

const ORIGIN = serverEnv().APP_ORIGIN;
const DAY = 24 * 60 * 60 * 1000;

let owner: Client;
const users: string[] = [];

/** Every run of the catch-up steps, in order. */
let runs: CatchUpRun[] = [];
let failNext = false;

const countingStep = async (_tx: unknown, run: CatchUpRun) => {
	if (failNext) {
		failNext = false;
		throw new Error("catch-up step failed");
	}
	runs.push(run);
};

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	CATCH_UP_STEPS.push(countingStep);
});

afterAll(async () => {
	CATCH_UP_STEPS.splice(CATCH_UP_STEPS.indexOf(countingStep), 1);
	await owner.query(`DELETE FROM auth."user" WHERE id = ANY($1::uuid[])`, [users]);
	await owner.end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
	// No note reset here: every test makes new users, who have no note yet, so the daily pass
	// runs once per file instead of once per test. Tests about the notes reset them themselves.
	runs = [];
	failNext = false;
});

afterEach(() => {
	vi.useRealTimers();
});

/** A signed-in user; with a profile whose `last_catch_up_on` is `lastCatchUpOn`, unless null. */
async function newUser(
	lastCatchUpOn: string | null = "2026-11-01",
	timezone = "Asia/Kolkata",
) {
	const user = await signedInUser(owner, "catch-up");
	users.push(user.id);
	if (lastCatchUpOn) {
		await insertRow(owner, "profile", {
			...PRIVATE_ROWS.profile(user.id),
			last_catch_up_on: lastCatchUpOn,
			timezone,
		});
	}
	return user;
}

async function profileRow(userId: string) {
	const { rows } = await owner.query(
		`SELECT last_catch_up_on::text AS last, version, updated_at FROM app.profile WHERE user_id = $1`,
		[userId],
	);
	return rows[0] as { last: string; version: number; updated_at: Date };
}

const page = route({}, async (ctx) => ({ today: ctx.today }));

const get = (cookie: string, headers: Record<string, string> = {}) =>
	page(new Request(`${ORIGIN}/api/test`, { headers: { cookie, ...headers } }));

const runsFor = (userId: string) => runs.filter((run) => run.user.id === userId);

// AC-P2-20
test("two requests at once on a new day run catch-up exactly once, leaving version alone", async () => {
	const user = await newUser();
	const before = await profileRow(user.id);
	const [a, b] = await Promise.all([get(user.cookie), get(user.cookie)]);
	expect([a.status, b.status]).toEqual([200, 200]);
	expect(runsFor(user.id)).toHaveLength(1);
	const after = await profileRow(user.id);
	expect(after.last).toBe("2026-11-02");
	expect(after.version).toBe(before.version);
	expect(after.updated_at).toEqual(before.updated_at);
});

test("a step gets the user, the request clock, today and the profile's zone", async () => {
	const user = await newUser();
	await get(user.cookie);
	expect(runsFor(user.id)).toEqual([
		{
			user: expect.objectContaining({ id: user.id }),
			now: new Date(GOLDEN_NOW),
			today: "2026-11-02",
			timezone: "Asia/Kolkata",
		},
	]);
});

test("the response already sees the catch-up's writes", async () => {
	const user = await newUser();
	const response = await get(user.cookie);
	expect((await response.json()).data.today).toBe("2026-11-02");
	expect((await profileRow(user.id)).last).toBe("2026-11-02");
});

test("a later request the same day skips the check, by the process's note", async () => {
	const user = await newUser();
	await get(user.cookie);
	// Behind the note's back, the database goes back a day; the note still says done.
	await owner.query(
		`UPDATE app.profile SET last_catch_up_on = '2026-11-01' WHERE user_id = $1`,
		[user.id],
	);
	await get(user.cookie);
	expect(runsFor(user.id)).toHaveLength(1);
	clearCatchUpNote(user.id);
	await get(user.cookie);
	expect(runsFor(user.id)).toHaveLength(2);
});

test("the next day runs it again", async () => {
	const user = await newUser();
	await get(user.cookie);
	vi.setSystemTime(new Date(new Date(GOLDEN_NOW).getTime() + DAY));
	await get(user.cookie);
	expect(runsFor(user.id).map((run) => run.today)).toEqual([
		"2026-11-02",
		"2026-11-03",
	]);
});

test("a profile already caught up today runs nothing", async () => {
	const user = await newUser("2026-11-02");
	await get(user.cookie);
	expect(runsFor(user.id)).toHaveLength(0);
});

describe("today comes from the profile's own zone", () => {
	// 20:00 UTC on 2 Nov is already 3 Nov in Kolkata, still 2 Nov in Los Angeles.
	const evening = new Date("2026-11-02T20:00:00.000Z");

	test("a zone past midnight is on the next day and runs", async () => {
		vi.setSystemTime(evening);
		const user = await newUser("2026-11-02", "Asia/Kolkata");
		await get(user.cookie);
		expect(runsFor(user.id).map((run) => run.today)).toEqual(["2026-11-03"]);
	});

	test("a zone behind is still on the same day and runs nothing", async () => {
		vi.setSystemTime(evening);
		const user = await newUser("2026-11-02", "America/Los_Angeles");
		await get(user.cookie);
		expect(runsFor(user.id)).toHaveLength(0);
		expect(catchUpDone(user.id, evening)).toBe(true);
	});
});

test("after a check that matched nothing, the profile the wrapper read becomes the note", async () => {
	// Already caught up today: the check matches no row, and the wrapper notes the profile.
	const user = await newUser("2026-11-02");
	await get(user.cookie);
	expect(catchUpDone(user.id, new Date(GOLDEN_NOW))).toBe(true);
	await owner.query(
		`UPDATE app.profile SET last_catch_up_on = '2026-11-01' WHERE user_id = $1`,
		[user.id],
	);
	await get(user.cookie);
	expect(runsFor(user.id)).toHaveLength(0);
});

// AC-P2-23
test("a user without a profile gets catch-up on their first request after onboarding", async () => {
	const user = await newUser(null);
	expect((await get(user.cookie)).status).toBe(403);
	expect(runsFor(user.id)).toHaveLength(0);
	await insertRow(owner, "profile", PRIVATE_ROWS.profile(user.id));
	expect((await get(user.cookie)).status).toBe(200);
	expect(runsFor(user.id)).toHaveLength(1);
});

// AC-P2-24
test("a run that fails rolls back, never fails the request, and is retried next time", async () => {
	const user = await newUser();
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		failNext = true;
		expect((await get(user.cookie)).status).toBe(200);
		expect((await profileRow(user.id)).last).toBe("2026-11-01");
		expect(error).toHaveBeenCalledWith("[catch-up] Failed", { name: "Error" });
	} finally {
		error.mockRestore();
	}
	await get(user.cookie);
	expect(runsFor(user.id)).toHaveLength(1);
	expect((await profileRow(user.id)).last).toBe("2026-11-02");
});

// AC-P2-25
test("Daybook-Queue: pending skips catch-up; the next request without it runs it", async () => {
	const user = await newUser();
	await get(user.cookie, { "daybook-queue": "pending" });
	expect(runsFor(user.id)).toHaveLength(0);
	expect((await profileRow(user.id)).last).toBe("2026-11-01");
	await get(user.cookie);
	expect(runsFor(user.id)).toHaveLength(1);
});

test("the daybook_queue=pending cookie skips it too", async () => {
	const user = await newUser();
	await get(`${user.cookie}; daybook_queue=pending`);
	expect(runsFor(user.id)).toHaveLength(0);
});

test("a route with catchUp off never runs it", async () => {
	const user = await newUser();
	const quiet = route({ catchUp: false }, async () => null);
	await quiet(
		new Request(`${ORIGIN}/api/test`, { headers: { cookie: user.cookie } }),
	);
	expect(runsFor(user.id)).toHaveLength(0);
});

test("a route without a profile requirement skips it by default", async () => {
	const user = await newUser();
	const open = route({ profile: false }, async () => null);
	await open(
		new Request(`${ORIGIN}/api/test`, { headers: { cookie: user.cookie } }),
	);
	expect(runsFor(user.id)).toHaveLength(0);
});

describe("runCatchUpIfDue", () => {
	test("with no profile matches nothing and leaves no note", async () => {
		const user = await newUser(null);
		const now = new Date(GOLDEN_NOW);
		await runCatchUpIfDue({ id: user.id, email: "x", name: "x" }, now);
		expect(runsFor(user.id)).toHaveLength(0);
		expect(catchUpDone(user.id, now)).toBe(false);
	});

	test("notes the database's answer after a run", async () => {
		const user = await newUser();
		const now = new Date(GOLDEN_NOW);
		await runCatchUpIfDue({ id: user.id, email: "x", name: "x" }, now);
		expect(catchUpDone(user.id, now)).toBe(true);
		expect(catchUpDone(user.id, new Date(now.getTime() + DAY))).toBe(false);
	});

	test("resetCatchUpNote also forgets the daily pass's note", async () => {
		// Close to the golden clock, so the pass's 90-day purge spares other files' records.
		const day = new Date("2026-12-02T09:00:00.000Z");
		await owner.query(
			"DELETE FROM app.daily_pass_markers WHERE day = '2026-12-02'",
		);
		let attempts = 0;
		const failOnce = async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("first attempt fails");
		};
		DAILY_PASS_STEPS.push(failOnce);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await runDailyPassIfDue(day);
			// The failure note holds back a retry for a minute...
			await runDailyPassIfDue(day);
			expect(attempts).toBe(1);
			// ...until the notes are reset.
			resetCatchUpNote();
			await runDailyPassIfDue(day);
			expect(attempts).toBe(2);
		} finally {
			error.mockRestore();
			DAILY_PASS_STEPS.splice(DAILY_PASS_STEPS.indexOf(failOnce), 1);
			await owner.query(
				"DELETE FROM app.daily_pass_markers WHERE day = '2026-12-02'",
			);
		}
	});

	test("resetCatchUpNote forgets every user", async () => {
		const user = await newUser();
		const now = new Date(GOLDEN_NOW);
		await runCatchUpIfDue({ id: user.id, email: "x", name: "x" }, now);
		resetCatchUpNote();
		expect(catchUpDone(user.id, now)).toBe(false);
	});
});
