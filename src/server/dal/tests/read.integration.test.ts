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
import { signedInUser } from "../../auth/tests/sessions";
import { GOLDEN_NOW, insertRow, PRIVATE_ROWS } from "../../db/tests/private-rows";
import { parseOwnerEnv } from "../../env";
import { CATCH_UP_STEPS, type CatchUpRun, catchUpDone } from "../catch-up";
import { prepareRead, readWith } from "../read";

let owner: Client;
const users: string[] = [];
let runs: CatchUpRun[] = [];
const step = async (_tx: unknown, run: CatchUpRun) => {
	runs.push(run);
};

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	CATCH_UP_STEPS.push(step);
});

afterAll(async () => {
	CATCH_UP_STEPS.splice(CATCH_UP_STEPS.indexOf(step), 1);
	await owner.query(`DELETE FROM auth."user" WHERE id = ANY($1::uuid[])`, [users]);
	await owner.end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
	// No note reset here: every test makes new users, who have no note yet, so the daily pass
	// runs once per file instead of once per test. Tests about the notes reset them themselves.
	runs = [];
});

afterEach(() => {
	vi.useRealTimers();
});

async function newUser(withProfile = true) {
	const user = await signedInUser(owner, "read");
	users.push(user.id);
	if (withProfile)
		await insertRow(owner, "profile", PRIVATE_ROWS.profile(user.id));
	return user;
}

describe("prepareRead", () => {
	test("is null without a valid session", async () => {
		expect(await prepareRead(new Headers())).toBeNull();
	});

	test("builds the context from the session and the request clock", async () => {
		const user = await newUser();
		const ctx = await prepareRead(new Headers({ cookie: user.cookie }));
		expect(ctx).toMatchObject({
			user: { id: user.id },
			profile: null,
			today: null,
			now: new Date(GOLDEN_NOW),
			pricesUpdated: false,
		});
		expect(ctx!.requestId).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("runs the catch-up check before the read (BR-P2-14)", async () => {
		const user = await newUser();
		await prepareRead(new Headers({ cookie: user.cookie }));
		expect(runs.map((run) => run.user.id)).toEqual([user.id]);
	});

	test("skips catch-up while the queue holds Subscription items", async () => {
		const user = await newUser();
		await prepareRead(
			new Headers({ cookie: user.cookie, "daybook-queue": "pending" }),
		);
		expect(runs).toHaveLength(0);
	});
});

describe("readWith", () => {
	test("reads the profile inside the transaction and sets today", async () => {
		const user = await newUser();
		const base = await prepareRead(new Headers({ cookie: user.cookie }));
		const ctx = await readWith(base!, async (ctx) => ctx);
		expect(ctx.profile).toMatchObject({ timezone: "Asia/Kolkata" });
		expect(ctx.today).toBe("2026-11-02");
	});

	test("notes the profile, so the next request skips the check", async () => {
		const user = await newUser(false);
		const base = await prepareRead(new Headers({ cookie: user.cookie }));
		await insertRow(owner, "profile", {
			...PRIVATE_ROWS.profile(user.id),
			last_catch_up_on: "2026-11-02",
		});
		await readWith(base!, async () => null);
		expect(catchUpDone(user.id, new Date(GOLDEN_NOW))).toBe(true);
	});

	test("gives a page no profile before onboarding, without refusing", async () => {
		const user = await newUser(false);
		const base = await prepareRead(new Headers({ cookie: user.cookie }));
		expect(await readWith(base!, async (ctx) => ctx.profile)).toBeNull();
	});

	test("runs in a read-only transaction", async () => {
		const user = await newUser();
		const base = await prepareRead(new Headers({ cookie: user.cookie }));
		await expect(
			readWith(base!, (_ctx, tx) =>
				tx.execute("UPDATE app.profile SET country = 'US'"),
			),
		).rejects.toThrow();
	});
});
