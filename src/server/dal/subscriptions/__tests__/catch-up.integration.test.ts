import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { uuidV7Time } from "@/lib/ids";
import type { SubscriptionRecord } from "@/lib/subscriptions/model";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { insertProfile, type LoadedGolden } from "../../../../../seed/load-golden";
import { createUser } from "../../../db/__tests__/private-rows";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import { resetCatchUpNote, runCatchUpIfDue } from "../../catch-up";
import { asUser, goldenContext } from "../../transactions/__tests__/helpers";
import { withUser, type Tx } from "../../with-user";
import {
	bootCatchUp,
	catchUpAll,
	catchUpSubscription,
	chargeContext,
	insertCharges,
	lockSubscriptions,
} from "../catch-up";
import { transactionIdOf, waitForWaiterOn } from "../../budgets/__tests__/helpers";
import { goldenUser } from "./helpers";

/** Catch-up (F05, BR-F05-02, BR-F05-05, BR-F05-06, JOB-1, JOB-2) through the runtime role and RLS.
 * Subscriptions the scenarios need are inserted inside a transaction that rolls back, so one
 * user serves them all; the runs that must commit use their own users. Expected figures come
 * from F05 section 5 and docs/03-golden-dataset.md. */

let owner: Client;
let bare: string;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	bare = await createUser(owner, "sub-catch-up");
	await insertProfile(owner, bare);
	users.push(bare);
}, 60_000);

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

const ctxOf = (userId = bare, timezone = "Asia/Kolkata") =>
	chargeContext(goldenContext(userId, { timezone }));

type SubFields = Partial<SubscriptionRecord>;

/** A Subscription record: golden Netflix unless `fields` change it. */
function record(fields: SubFields = {}): SubscriptionRecord {
	return {
		id: "0199a000-0000-7000-8002-0000000000a1",
		name: "Netflix",
		amountMinor: 64900,
		cadence: { unit: "month", every: 1 },
		startDate: "2026-09-05",
		category: "entertainment",
		note: null,
		endDate: null,
		pause: null,
		chargesFrom: "2026-09-05",
		lastChangeOn: "2026-09-05",
		demo: false,
		version: 1,
		...fields,
	};
}

/** Inserts `subscriptions` for `userId` in one statement, inside `tx`. */
async function insertSubscriptions(
	tx: Tx,
	userId: string,
	subscriptions: SubscriptionRecord[],
): Promise<void> {
	const rows = subscriptions.map((each) => ({
		...each,
		pauseFrom: each.pause?.from ?? null,
		pauseUntil: each.pause?.until ?? null,
	}));
	await tx.execute(
		sql`INSERT INTO app.subscriptions (id, user_id, created_at, updated_at, name, amount_minor,
			cadence_unit, cadence_every, start_date, category, note, end_date, pause_from,
			pause_until, charges_from, last_change_on, demo, version)
		SELECT r.id, ${userId}, ${GOLDEN_NOW}, ${GOLDEN_NOW}, r.name, r."amountMinor",
			r.cadence->>'unit', (r.cadence->>'every')::int, r."startDate", r.category, r.note,
			r."endDate", r."pauseFrom", r."pauseUntil", r."chargesFrom", r."lastChangeOn", r.demo,
			r.version
		FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(
			id uuid, name text, "amountMinor" bigint, cadence jsonb, "startDate" date,
			category text, note text, "endDate" date, "pauseFrom" date, "pauseUntil" date,
			"chargesFrom" date, "lastChangeOn" date, demo boolean, version int)`,
	);
}

type ChargeRow = {
	dueOn: string;
	occurredOn: string;
	occurredAt: string;
	amountMinor: string;
	category: string;
	payee: string;
	type: string;
	source: string;
	edited: boolean;
	demo: boolean;
	version: number;
	createdAt: string;
	updatedAt: string;
	id: string;
};

/** The charges of `subscriptionId`, oldest due date first. */
async function chargesOf(tx: Tx, subscriptionId: string): Promise<ChargeRow[]> {
	const { rows } = await tx.execute<ChargeRow>(
		sql`SELECT id, due_on::text AS "dueOn", occurred_on::text AS "occurredOn",
			to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "occurredAt",
			amount_minor::text AS "amountMinor", category, payee, type, source, edited, demo, version,
			to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
			to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
		FROM app.transactions WHERE subscription_id = ${subscriptionId}::uuid ORDER BY due_on`,
	);
	return rows;
}

const dueOns = (rows: ChargeRow[]) => rows.map((row) => row.dueOn);

/** Runs `fn` as `bare` in a rolled-back transaction that has `subscriptions` inserted. */
function withSubs<T>(
	subscriptions: SubscriptionRecord[],
	fn: (tx: Tx) => Promise<T>,
	userId = bare,
) {
	return asUser(userId, async (tx) => {
		await insertSubscriptions(tx, userId, subscriptions);
		return fn(tx);
	});
}

const THROUGH_TODAY = { through: "2026-11-02", skipped: [] as string[] };

describe("catchUpSubscription: which dates get a charge (BR-F05-02)", () => {
	// F05 section 5: catch-up on 2 November creates row 27 (Sunrise Apartments, due 1 November).
	test("golden Sunrise Apartments, charged through October, needs exactly 1 November", async () => {
		const sunrise = record({
			name: "Sunrise Apartments",
			amountMinor: 1800000,
			category: "housing",
			startDate: "2026-09-01",
			chargesFrom: "2026-09-01",
		});
		const { result } = await withSubs([sunrise], async (tx) => {
			const first = await catchUpSubscription(tx, ctxOf(), sunrise, {
				through: "2026-10-31",
				skipped: [],
			});
			const second = await catchUpSubscription(
				tx,
				ctxOf(),
				sunrise,
				THROUGH_TODAY,
			);
			return { first, second, rows: await chargesOf(tx, sunrise.id) };
		});
		expect(result.first.created).toBe(2);
		expect(result.second).toEqual({ created: 1, months: ["2026-11"] });
		expect(dueOns(result.rows)).toEqual([
			"2026-09-01",
			"2026-10-01",
			"2026-11-01",
		]);
		expect(result.rows[2]).toMatchObject({
			dueOn: "2026-11-01",
			occurredOn: "2026-11-01",
			occurredAt: "2026-10-31T18:30:00Z",
			amountMinor: "1800000",
			category: "housing",
			payee: "Sunrise Apartments",
			type: "expense",
			source: "subscription",
			edited: false,
			demo: false,
			version: 1,
		});
	});

	test("creates every chargeable date through today, none after it, whatever `through` says", async () => {
		const sub = record();
		const { result } = await withSubs([sub], async (tx) => {
			const made = await catchUpSubscription(tx, ctxOf(), sub, {
				through: "2027-12-31",
				skipped: [],
			});
			return { made, rows: await chargesOf(tx, sub.id) };
		});
		expect(dueOns(result.rows)).toEqual(["2026-09-05", "2026-10-05"]);
		expect(result.made).toEqual({ created: 2, months: ["2026-09", "2026-10"] });
	});

	test("stops at `through` when that is before today", async () => {
		const sub = record();
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, {
				through: "2026-09-30",
				skipped: [],
			});
			return chargesOf(tx, sub.id);
		});
		expect(dueOns(result)).toEqual(["2026-09-05"]);
	});

	test("a date due today is charged: today is a due date", async () => {
		const sub = record({ startDate: "2026-09-02", chargesFrom: "2026-09-02" });
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		expect(dueOns(result)).toEqual(["2026-09-02", "2026-10-02", "2026-11-02"]);
	});

	test("starts at chargesFrom: months before it are never charged", async () => {
		const sub = record({ chargesFrom: "2026-10-03" });
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		expect(dueOns(result)).toEqual(["2026-10-05"]);
	});

	test("stops at the end date, which is itself charged", async () => {
		const sub = record({ endDate: "2026-10-05" });
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		expect(dueOns(result)).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("never charges a paused date", async () => {
		const sub = record({ pause: { from: "2026-10-01", until: "2026-11-01" } });
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		expect(dueOns(result)).toEqual(["2026-09-05"]);
	});

	// AC-F05-09: a tombstoned date is never recreated.
	test("never charges a tombstoned date, past or future", async () => {
		const sub = record();
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, {
				through: "2027-01-31",
				skipped: ["2026-09-05", "2026-12-05"],
			});
			return chargesOf(tx, sub.id);
		});
		expect(dueOns(result)).toEqual(["2026-10-05"]);
	});

	test("an upcoming Subscription gets nothing", async () => {
		const sub = record({ startDate: "2026-12-05", chargesFrom: "2026-12-05" });
		const { result } = await withSubs([sub], async (tx) => {
			const made = await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return { made, rows: await chargesOf(tx, sub.id) };
		});
		expect(result.made).toEqual({ created: 0, months: [] });
		expect(result.rows).toEqual([]);
	});

	test("a long absence charges every missed date at once, each on its own day", async () => {
		const sub = record({ startDate: "2025-01-05", chargesFrom: "2025-01-05" });
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		expect(result).toHaveLength(22);
		expect(result[0]?.dueOn).toBe("2025-01-05");
		expect(result.at(-1)?.dueOn).toBe("2026-10-05");
		expect(new Set(dueOns(result)).size).toBe(22);
	});

	test("an end date before chargesFrom charges nothing", async () => {
		const sub = record({ chargesFrom: "2026-11-01", endDate: "2026-10-31" });
		const { result } = await withSubs([sub], async (tx) =>
			catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY),
		);
		expect(result.created).toBe(0);
	});
});

describe("what a charge holds (BR-F05-02)", () => {
	test("is an unedited expense of the Subscription's amount, category and name, recorded at the request clock", async () => {
		const sub = record({
			amountMinor: 79900,
			category: "shopping",
			name: "Netflix Premium",
		});
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		expect(result).toHaveLength(2);
		for (const row of result) {
			expect(row).toMatchObject({
				type: "expense",
				amountMinor: "79900",
				category: "shopping",
				payee: "Netflix Premium",
				source: "subscription",
				edited: false,
				demo: false,
				version: 1,
				createdAt: "2026-11-02T06:30:00.000Z",
				updatedAt: "2026-11-02T06:30:00.000Z",
			});
			expect(row.occurredOn).toBe(row.dueOn);
		}
	});

	test("gets a new UUIDv7 id carrying the request clock", async () => {
		const sub = record();
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		for (const row of result) {
			expect(row.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
			expect(uuidV7Time(row.id)).toBe(new Date(GOLDEN_NOW).getTime());
		}
		expect(new Set(result.map((row) => row.id)).size).toBe(2);
	});

	// AC-F05-10
	test("a demo Subscription's charges are demo rows", async () => {
		const sub = record({ demo: true });
		const { result } = await withSubs([sub], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		expect(result.map((row) => row.demo)).toEqual([true, true]);
	});

	describe("is dated at midnight in the profile zone (TIME-6)", () => {
		test.each([
			["Asia/Kolkata", "2026-11-05", "2026-11-04T18:30:00Z"],
			["UTC", "2026-11-05", "2026-11-05T00:00:00Z"],
			["America/New_York", "2026-11-05", "2026-11-05T05:00:00Z"],
			// Daylight saving ended on 1 November 2026: midnight is 07:00 UTC, the day after 06:00... in Los Angeles.
			["America/Los_Angeles", "2026-11-01", "2026-11-01T07:00:00Z"],
			["Pacific/Kiritimati", "2026-11-05", "2026-11-04T10:00:00Z"],
		])("%s on %s is %s", async (timezone, dueOn, expected) => {
			const sub = record({ startDate: dueOn, chargesFrom: dueOn });
			const ctx = { ...ctxOf(bare, timezone), today: dueOn };
			const { result } = await withSubs([sub], async (tx) => {
				await catchUpSubscription(tx, ctx, sub, {
					through: dueOn,
					skipped: [],
				});
				return chargesOf(tx, sub.id);
			});
			expect(result).toHaveLength(1);
			expect(result[0]?.occurredAt).toBe(expected);
			expect(result[0]?.occurredOn).toBe(dueOn);
		});

		// Section 13: midnight that does not exist moves forward by the gap. Chile sets its clocks
		// forward at midnight on 6 September 2026, so 00:00 does not exist and the charge falls at
		// 01:00, which is 04:00 UTC.
		test("midnight that does not exist moves forward by the gap: Santiago on 6 September", async () => {
			const sub = record({
				startDate: "2026-09-06",
				chargesFrom: "2026-09-06",
			});
			const ctx = { ...ctxOf(bare, "America/Santiago"), today: "2026-09-06" };
			const { result } = await withSubs([sub], async (tx) => {
				await catchUpSubscription(tx, ctx, sub, {
					through: "2026-09-06",
					skipped: [],
				});
				return chargesOf(tx, sub.id);
			});
			expect(result[0]).toMatchObject({
				occurredAt: "2026-09-06T04:00:00Z",
				occurredOn: "2026-09-06",
			});
		});
	});
});

describe("catchUpSubscription is idempotent and keeps what exists", () => {
	test("a second run creates nothing", async () => {
		const sub = record();
		const { result } = await withSubs([sub], async (tx) => {
			const first = await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			const second = await catchUpSubscription(
				tx,
				ctxOf(),
				sub,
				THROUGH_TODAY,
			);
			return { first, second, rows: await chargesOf(tx, sub.id) };
		});
		expect(result.first.created).toBe(2);
		expect(result.second).toEqual({ created: 0, months: [] });
		expect(result.rows).toHaveLength(2);
	});

	test("creates only the dates that have no charge", async () => {
		const sub = record();
		const { result } = await withSubs([sub], async (tx) => {
			await insertCharges(tx, ctxOf(), [
				{ subscription: sub, dates: ["2026-09-05"] },
			]);
			const made = await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return { made, rows: await chargesOf(tx, sub.id) };
		});
		expect(result.made).toEqual({ created: 1, months: ["2026-10"] });
		expect(dueOns(result.rows)).toEqual(["2026-09-05", "2026-10-05"]);
	});

	test("an edited charge counts as the date's charge: it is neither duplicated nor touched", async () => {
		const sub = record();
		const { result } = await withSubs([sub], async (tx) => {
			await insertCharges(tx, ctxOf(), [
				{ subscription: sub, dates: ["2026-09-05"] },
			]);
			await tx.execute(
				sql`UPDATE app.transactions SET edited = true, amount_minor = 12300, payee = 'Mine'
					WHERE subscription_id = ${sub.id}::uuid`,
			);
			await catchUpSubscription(tx, ctxOf(), sub, THROUGH_TODAY);
			return chargesOf(tx, sub.id);
		});
		expect(
			result.map((row) => [row.dueOn, row.edited, row.amountMinor, row.payee]),
		).toEqual([
			["2026-09-05", true, "12300", "Mine"],
			["2026-10-05", false, "64900", "Netflix"],
		]);
	});

	test("charges of another Subscription on the same date do not block it", async () => {
		const first = record();
		const second = record({
			id: "0199a000-0000-7000-8002-0000000000a2",
			name: "Prime",
		});
		const { result } = await withSubs([first, second], async (tx) => {
			await catchUpSubscription(tx, ctxOf(), first, THROUGH_TODAY);
			const made = await catchUpSubscription(
				tx,
				ctxOf(),
				second,
				THROUGH_TODAY,
			);
			return made;
		});
		expect(result.created).toBe(2);
	});
});

describe("insertCharges", () => {
	test("sends nothing for no dates", async () => {
		const { result, statements } = await asUser(bare, (tx) =>
			insertCharges(tx, ctxOf(), [{ subscription: record(), dates: [] }]),
		);
		expect(result).toEqual({ created: 0, months: [] });
		expect(statements).toBe(0);
	});

	test("reports the months it created in order, once each", async () => {
		const sub = record({ startDate: "2025-12-05", chargesFrom: "2025-12-05" });
		const { result } = await withSubs([sub], (tx) =>
			insertCharges(tx, ctxOf(), [
				{
					subscription: sub,
					dates: ["2026-02-05", "2025-12-05", "2026-01-05", "2026-01-12"],
				},
			]),
		);
		expect(result).toEqual({
			created: 4,
			months: ["2025-12", "2026-01", "2026-02"],
		});
	});

	// BR-F05-02, section 13: about 520 charges for a weekly Subscription started 10 years ago, in
	// one statement: the statement count does not grow with the charges.
	test("a weekly backfill of 10 years is 522 charges in the same statements as two", async () => {
		const weekly = (startDate: string) =>
			record({
				startDate,
				chargesFrom: startDate,
				cadence: { unit: "week", every: 1 },
			});
		const long = weekly("2016-11-03");
		const short = weekly("2026-10-22");
		const run = (sub: SubscriptionRecord) =>
			withSubs([sub], async (tx) => {
				const made = await catchUpSubscription(
					tx,
					ctxOf(),
					sub,
					THROUGH_TODAY,
				);
				return { made, rows: (await chargesOf(tx, sub.id)).length };
			});
		const big = await run(long);
		const small = await run(short);
		expect(big.result.made.created).toBe(522);
		expect(big.result.rows).toBe(522);
		expect(small.result.made.created).toBe(2);
		expect(big.statements).toBe(small.statements);
	});
});

describe("catchUpAll and the locks (BR-F05-05, SRV-7, JOB-2)", () => {
	const three = () => [
		record({ id: "0199a000-0000-7000-8002-0000000000a3", name: "C" }),
		record({ id: "0199a000-0000-7000-8002-0000000000a1", name: "A" }),
		record({ id: "0199a000-0000-7000-8002-0000000000a2", name: "B" }),
	];

	test("catches every Subscription up in one locking read and one insert, however many there are", async () => {
		const one = await withSubs([record()], (tx) => catchUpAll(tx, ctxOf()));
		const many = await withSubs(three(), (tx) => catchUpAll(tx, ctxOf()));
		expect(one.result.created).toBe(2);
		expect(many.result.created).toBe(6);
		// The setup is one insert in both; catch-up adds a read and an insert.
		expect(one.statements).toBe(3);
		expect(many.statements).toBe(3);
	});

	test("reads the tombstones itself: a skipped date stays skipped (AC-F05-09)", async () => {
		const sub = record();
		const { result } = await withSubs([sub], async (tx) => {
			await tx.execute(
				sql`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at, subscription_id, due_on)
				VALUES (gen_random_uuid(), ${bare}, ${GOLDEN_NOW}, ${GOLDEN_NOW}, ${sub.id}, '2026-10-05'),
					(gen_random_uuid(), ${bare}, ${GOLDEN_NOW}, ${GOLDEN_NOW}, ${sub.id}, '2026-12-05')`,
			);
			await catchUpAll(tx, ctxOf());
			return chargesOf(tx, sub.id);
		});
		expect(dueOns(result)).toEqual(["2026-09-05"]);
	});

	test("locks the Subscriptions in id order, with their tombstones", async () => {
		const { result } = await withSubs(three(), async (tx) => {
			await tx.execute(
				sql`INSERT INTO app.subscription_skips (id, user_id, created_at, updated_at, subscription_id, due_on)
				VALUES (gen_random_uuid(), ${bare}, ${GOLDEN_NOW}, ${GOLDEN_NOW},
					'0199a000-0000-7000-8002-0000000000a2', '2026-10-05')`,
			);
			return lockSubscriptions(tx);
		});
		expect(result.map((each) => each.subscription.name)).toEqual([
			"A",
			"B",
			"C",
		]);
		expect(result.map((each) => each.skipped)).toEqual([[], ["2026-10-05"], []]);
		expect(result[0]?.subscription).toMatchObject({
			amountMinor: 64900,
			cadence: { unit: "month", every: 1 },
			chargesFrom: "2026-09-05",
			endDate: null,
			pause: null,
		});
	});

	test("with no Subscriptions, nothing happens", async () => {
		expect((await asUser(bare, (tx) => catchUpAll(tx, ctxOf()))).result).toEqual(
			{
				created: 0,
				months: [],
			},
		);
	});

	// SRV-7, JOB-2: catch-up takes `FOR UPDATE` on the Subscription, so it waits for whoever holds
	// it (a change, a charge delete) and then sees what they committed.
	test("waits for a held Subscription lock, then runs", async () => {
		const before = await goldenUser(owner, "sub-catch-up-wait", {
			beforeCatchUp: true,
		});
		users.push(before.userId);
		const ctx = goldenContext(before.userId);
		const holder = await runtimePool().connect();
		try {
			await holder.query("BEGIN");
			await holder.query("SELECT set_config('app.user_id', $1, true)", [
				before.userId,
			]);
			await holder.query(
				"SELECT id FROM app.subscriptions WHERE id = $1 FOR UPDATE",
				[before.subscription("sunrise")],
			);
			const xid = await transactionIdOf(holder as unknown as Client);
			let finished = false;
			const run = withUser({ user: ctx.user }, "write", (tx) =>
				catchUpAll(tx, chargeContext(ctx)),
			).finally(() => {
				finished = true;
			});
			await waitForWaiterOn(owner, xid);
			expect(finished).toBe(false);
			await holder.query("COMMIT");
			expect((await run).created).toBe(1);
		} finally {
			await holder.query("ROLLBACK").catch(() => {});
			holder.release();
		}
	}, 60_000);
});

describe("the lazy step (BR-F05-05, JOB-1, AC-F05-03)", () => {
	let before: LoadedGolden;
	const asRun = (userId: string) => ({
		id: userId,
		email: "x@daybook.test",
		name: "X",
	});

	beforeAll(async () => {
		before = await goldenUser(owner, "sub-catch-up-lazy", {
			beforeCatchUp: true,
		});
		users.push(before.userId);
	}, 60_000);

	beforeEach(() => {
		resetCatchUpNote();
		vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
		return () => vi.useRealTimers();
	});

	const count = async (userId: string) =>
		Number(
			(
				await owner.query<{ n: string }>(
					"SELECT count(*) AS n FROM app.transactions WHERE user_id = $1",
					[userId],
				)
			).rows[0]?.n,
		);

	// AC-F05-03: the first golden request on 2 November creates row 27 only.
	test("the first check of the day creates row 27 and nothing else, once", async () => {
		expect(await count(before.userId)).toBe(21);
		await runCatchUpIfDue(asRun(before.userId), new Date(GOLDEN_NOW));
		expect(await count(before.userId)).toBe(22);
		const { rows } = await owner.query(
			`SELECT due_on::text, occurred_at, amount_minor::text, category, payee, source, edited, demo,
				subscription_id
			 FROM app.transactions WHERE user_id = $1 AND due_on = '2026-11-01'`,
			[before.userId],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			due_on: "2026-11-01",
			amount_minor: "1800000",
			category: "housing",
			payee: "Sunrise Apartments",
			source: "subscription",
			edited: false,
			demo: false,
			subscription_id: before.subscription("sunrise"),
		});
		expect((rows[0] as { occurred_at: Date }).occurred_at.toISOString()).toBe(
			"2026-10-31T18:30:00.000Z",
		);
		const { rows: profile } = await owner.query(
			"SELECT last_catch_up_on::text FROM app.profile WHERE user_id = $1",
			[before.userId],
		);
		expect(profile[0]).toEqual({ last_catch_up_on: "2026-11-02" });
		// Running the check again today does nothing more.
		resetCatchUpNote();
		await runCatchUpIfDue(asRun(before.userId), new Date(GOLDEN_NOW));
		expect(await count(before.userId)).toBe(22);
	});
});

describe("the boot catch-up (BR-F05-06, AC-F05-03)", () => {
	const boot = (userId: string, ctx = goldenContext(userId)) =>
		withUser({ user: ctx.user }, "write", (tx) => bootCatchUp(tx, ctx));

	test("creates row 27, then nothing on a repeat", async () => {
		const before = await goldenUser(owner, "sub-boot", { beforeCatchUp: true });
		users.push(before.userId);
		expect(await boot(before.userId)).toEqual({ chargesCreated: 1 });
		expect(await boot(before.userId)).toEqual({ chargesCreated: 0 });
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.transactions WHERE user_id = $1",
			[before.userId],
		);
		expect(rows[0]).toEqual({ n: 22 });
		const profile = await owner.query(
			"SELECT last_catch_up_on::text FROM app.profile WHERE user_id = $1",
			[before.userId],
		);
		expect(profile.rows[0]).toEqual({ last_catch_up_on: "2026-11-02" });
	}, 60_000);

	test("golden as it stands has nothing to create", async () => {
		const current = await goldenUser(owner, "sub-boot-current");
		users.push(current.userId);
		expect(await boot(current.userId)).toEqual({ chargesCreated: 0 });
	}, 60_000);

	test("never lowers last_catch_up_on, whatever the clock says", async () => {
		const ahead = await goldenUser(owner, "sub-boot-ahead");
		users.push(ahead.userId);
		await owner.query(
			"UPDATE app.profile SET last_catch_up_on = '2026-11-05' WHERE user_id = $1",
			[ahead.userId],
		);
		await boot(ahead.userId);
		const { rows } = await owner.query(
			"SELECT last_catch_up_on::text FROM app.profile WHERE user_id = $1",
			[ahead.userId],
		);
		expect(rows[0]).toEqual({ last_catch_up_on: "2026-11-05" });
	}, 60_000);

	test("touches only the user's own Subscriptions", async () => {
		const mine = await goldenUser(owner, "sub-boot-mine", {
			beforeCatchUp: true,
		});
		const theirs = await goldenUser(owner, "sub-boot-theirs", {
			beforeCatchUp: true,
		});
		users.push(mine.userId, theirs.userId);
		expect(await boot(mine.userId)).toEqual({ chargesCreated: 1 });
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.transactions WHERE user_id = $1 AND due_on = '2026-11-01'",
			[theirs.userId],
		);
		expect(rows[0]).toEqual({ n: 0 });
	}, 90_000);

	// Two requests at once (two tabs, or a boot and a lazy check): the second waits on the
	// Subscription locks, then finds the charge the first made.
	test("two runs at once create each charge once", async () => {
		const before = await goldenUser(owner, "sub-boot-race", {
			beforeCatchUp: true,
		});
		users.push(before.userId);
		const [a, b] = await Promise.all([boot(before.userId), boot(before.userId)]);
		expect(a.chargesCreated + b.chargesCreated).toBe(1);
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM app.transactions WHERE user_id = $1",
			[before.userId],
		);
		expect(rows[0]).toEqual({ n: 22 });
	}, 60_000);
});
