import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { insertProfile, type LoadedGolden } from "../../../../../seed/load-golden";
import { createUser } from "../../../db/__tests__/private-rows";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import { asUser, goldenContext } from "../../transactions/__tests__/helpers";
import { subscriptionMonths } from "../months";
import {
	addCharge,
	addSkip,
	addSubscription,
	goldenUser,
	ownerExec,
} from "./helpers";

/** `GET /api/subscriptions/months` (BR-F05-36, AC-F05-24) through the runtime role and RLS,
 * against the golden dataset. Expected figures are copied from F05 section 5 and
 * docs/03-golden-dataset.md. */

let owner: Client;
let golden: LoadedGolden;
let neighbour: LoadedGolden;
let deleted: LoadedGolden;
let empty: string;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await goldenUser(owner, "sub-months");
	neighbour = await goldenUser(owner, "sub-months-neighbour");
	deleted = await goldenUser(owner, "sub-months-deleted");
	empty = await createUser(owner, "sub-months-empty");
	await insertProfile(owner, empty);
	users.push(golden.userId, neighbour.userId, deleted.userId, empty);
	// Delete Cult Gym and Netflix: their charges stay as ordinary expenses (BR-F05-14).
	for (const name of ["cultGym", "netflix"] as const) {
		const id = deleted.subscription(name);
		await ownerExec(
			owner,
			"DELETE FROM app.subscription_skips WHERE subscription_id = $1",
			[id],
		);
		await ownerExec(owner, "DELETE FROM app.subscriptions WHERE id = $1", [id]);
	}
}, 120_000);

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

const months = (from: string, to: string, who = golden.userId) =>
	asUser(who, (tx) => subscriptionMonths(tx, goldenContext(who), { from, to }));
const rows = async (from: string, to: string, who = golden.userId) =>
	(await months(from, to, who)).result.months.map((row) => [
		row.month,
		row.chargedMinor,
		row.expectedMinor,
	]);

describe("subscriptionMonths on golden", () => {
	// golden: October 20,148.00 and 0; November 18,000.00 and 2,149.00; December 0 and 20,149.00.
	test("October to December: charged and expected as the dataset says", async () => {
		expect(await rows("2026-10", "2026-12")).toEqual([
			["2026-10", 2014800, 0],
			["2026-11", 1800000, 214900],
			["2026-12", 0, 2014900],
		]);
	});

	test("answers in one statement, with the profile currency", async () => {
		const { result, statements } = await months("2026-10", "2026-12");
		expect(statements).toBe(1);
		expect(result.currency).toBe("INR");
	});

	test("a month before the first charge has nothing, and a past month expects nothing", async () => {
		expect(await rows("2026-07", "2026-08")).toEqual([
			["2026-07", 0, 0],
			["2026-08", 0, 0],
		]);
	});

	// golden Monthly totals, charges only: September 20,149.00 (#1, #5, #7).
	test("September: the three charges of that month and nothing expected", async () => {
		expect(await rows("2026-09", "2026-09")).toEqual([["2026-09", 2014900, 0]]);
	});

	test("one month answers one row", async () => {
		expect((await months("2026-11", "2026-11")).result.months).toHaveLength(1);
	});

	test("24 months run in order, from one statement", async () => {
		const { result, statements } = await months("2026-11", "2028-10");
		expect(statements).toBe(1);
		expect(result.months).toHaveLength(24);
		expect(result.months[0]?.month).toBe("2026-11");
		expect(result.months.at(-1)?.month).toBe("2028-10");
	});

	test("a month a year ahead expects every Subscription due then: October 2027 holds Amazon Prime too", async () => {
		const [october] = (await months("2027-10", "2027-10")).result.months;
		expect(october).toEqual({
			month: "2027-10",
			chargedMinor: 0,
			expectedMinor: 64900 + 150000 + 1800000 + 149900,
		});
	});

	test("a month that crosses a year end is named by its own year", async () => {
		expect(
			(await months("2026-12", "2027-01")).result.months.map(
				(row) => row.month,
			),
		).toEqual(["2026-12", "2027-01"]);
	});
});

describe("what changes a month", () => {
	test("a skipped date leaves the expected figure: Netflix's 5 November takes 649.00 off November", async () => {
		const loaded = await goldenUser(owner, "sub-months-skip");
		users.push(loaded.userId);
		await addSkip(
			owner,
			loaded.userId,
			loaded.subscription("netflix"),
			"2026-11-05",
		);
		expect(await rows("2026-11", "2026-12", loaded.userId)).toEqual([
			["2026-11", 1800000, 150000],
			["2026-12", 0, 1950000 + 64900],
		]);
	});

	// An end date of 4 December: Netflix charges on 5 November but not on 5 December.
	test.each([
		[
			"a paused date leaves the expected figure and resumes after the pause",
			"sub-months-pause",
			"UPDATE app.subscriptions SET pause_from = '2026-11-05', pause_until = '2027-01-05' WHERE id = $1",
			"2027-01",
			[
				["2026-11", 1800000, 150000],
				["2026-12", 0, 1950000],
				["2027-01", 0, 1950000 + 64900],
			],
		],
		[
			"an end date stops a month's expected figure at that date",
			"sub-months-end",
			"UPDATE app.subscriptions SET end_date = '2026-12-04' WHERE id = $1",
			"2026-12",
			[
				["2026-11", 1800000, 214900],
				["2026-12", 0, 1950000],
			],
		],
	])("%s", async (_title, label, update, to, expected) => {
		const loaded = await goldenUser(owner, label);
		users.push(loaded.userId);
		await ownerExec(owner, update, [loaded.subscription("netflix")]);
		expect(await rows("2026-11", to, loaded.userId)).toEqual(expected);
	});

	test("a charged date is not expected twice: the date is charged, so only its charge counts", async () => {
		const loaded = await goldenUser(owner, "sub-months-charged");
		users.push(loaded.userId);
		await addCharge(owner, loaded.userId, {
			subscriptionId: loaded.subscription("netflix"),
			dueOn: "2026-11-05",
		});
		expect(await rows("2026-11", "2026-11", loaded.userId)).toEqual([
			["2026-11", 1800000 + 64900, 150000],
		]);
	});

	test("a weekly Subscription expects every Thursday of the month still ahead", async () => {
		const loaded = await goldenUser(owner, "sub-months-weekly");
		users.push(loaded.userId);
		await addSubscription(owner, loaded.userId, {
			name: "Gym weekly",
			amountMinor: 12000,
			cadence: { unit: "week", every: 1 },
			startDate: "2026-10-01",
			chargesFrom: "2026-10-01",
		});
		// 5, 12, 19 and 26 November: four dates at 120.00 on top of 2,149.00.
		expect(await rows("2026-11", "2026-11", loaded.userId)).toEqual([
			["2026-11", 1800000, 214900 + 4 * 12000],
		]);
	});

	test("an unlinked charge of the month counts in the charged figure as Transactions do", async () => {
		const loaded = await goldenUser(owner, "sub-months-unlinked");
		users.push(loaded.userId);
		await addCharge(owner, loaded.userId, {
			subscriptionId: null,
			dueOn: "2026-11-01",
			amountMinor: 20000,
		});
		expect(await rows("2026-11", "2026-11", loaded.userId)).toEqual([
			["2026-11", 1800000 + 20000, 214900],
		]);
	});
});

describe("charges of deleted Subscriptions (BR-F05-18)", () => {
	// F05 section 7.6: the charges stay, and check E still totals 20,148.00.
	test("October still charges 20,148.00 though Netflix and Cult Gym are gone", async () => {
		expect(await rows("2026-10", "2026-10", deleted.userId)).toEqual([
			["2026-10", 2014800, 0],
		]);
	});

	test("what they would have charged ahead is no longer expected", async () => {
		expect(await rows("2026-11", "2026-12", deleted.userId)).toEqual([
			["2026-11", 1800000, 0],
			["2026-12", 0, 1800000],
		]);
	});
});

describe("isolation and empty", () => {
	test("a golden neighbour's charges do not double a month", async () => {
		expect(await rows("2026-10", "2026-10", neighbour.userId)).toEqual([
			["2026-10", 2014800, 0],
		]);
		expect(await rows("2026-10", "2026-10")).toEqual([["2026-10", 2014800, 0]]);
	});

	test("a user with no Subscriptions has zeros in every month", async () => {
		expect(await rows("2026-10", "2026-12", empty)).toEqual([
			["2026-10", 0, 0],
			["2026-11", 0, 0],
			["2026-12", 0, 0],
		]);
	});
});
