import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { insertProfile, type LoadedGolden } from "../../../../../seed/load-golden";
import { createUser } from "../../../db/__tests__/private-rows";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import { asUser, goldenContext } from "../../transactions/__tests__/helpers";
import {
	getSubscriptionItem,
	listSubscriptions,
	subscriptionCosts,
	subscriptionSummary,
	upcomingDue,
} from "../read";
import {
	addCharge,
	addSkip,
	addSubscription,
	goldenUser,
	ownerExec,
} from "./helpers";

/** The Subscription reads (F05 section 11, BR-F05-17 to BR-F05-20, BR-F05-35) through the
 * runtime role and RLS, against the golden dataset on 2 November. Expected figures are copied
 * from F05 section 5 and docs/03-golden-dataset.md#subscriptions-as-of-2-november. */

let owner: Client;
let golden: LoadedGolden;
let neighbour: LoadedGolden;
let empty: string;
const users: string[] = [];
const variants: Record<string, LoadedGolden> = {};

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await goldenUser(owner, "sub-reads");
	// A second golden user: had RLS failed, every golden figure here would double.
	neighbour = await goldenUser(owner, "sub-reads-neighbour");
	empty = await createUser(owner, "sub-reads-empty");
	await insertProfile(owner, empty);
	users.push(golden.userId, neighbour.userId, empty);

	const variant = async (
		name: string,
		change?: (user: LoadedGolden) => Promise<void>,
	) => {
		const loaded = await goldenUser(owner, `sub-reads-${name}`);
		users.push(loaded.userId);
		await change?.(loaded);
		variants[name] = loaded;
	};
	const set = (
		loaded: LoadedGolden,
		column: string,
		value: string | null,
		name = "netflix" as const,
	) =>
		ownerExec(
			owner,
			`UPDATE app.subscriptions SET ${column} = $1 WHERE id = $2`,
			[value, loaded.subscription(name)],
		);

	await variant("before-catch-up");
	variants["before-catch-up"] = await goldenUser(owner, "sub-reads-before", {
		beforeCatchUp: true,
	});
	users.push(variants["before-catch-up"].userId);
	await variant("paused", (loaded) =>
		ownerExec(
			owner,
			"UPDATE app.subscriptions SET pause_from = '2026-11-05', pause_until = '2027-01-05' WHERE id = $1",
			[loaded.subscription("netflix")],
		),
	);
	await variant("skipped", (loaded) =>
		addSkip(owner, loaded.userId, loaded.subscription("netflix"), "2026-11-05"),
	);
	await variant("cancelled", async (loaded) => {
		await set(loaded, "end_date", "2026-09-30");
		await ownerExec(owner, "DELETE FROM app.transactions WHERE id = $1", [
			loaded.id(16),
		]);
	});
	await variant("ended-today", (loaded) => set(loaded, "end_date", "2026-11-02"));
	await variant("ending", (loaded) => set(loaded, "end_date", "2026-12-31"));
	await variant("extra", async (loaded) => {
		await addSubscription(owner, loaded.userId, {
			name: "Gym weekly",
			amountMinor: 12000,
			cadence: { unit: "week", every: 1 },
			startDate: "2026-10-01",
			chargesFrom: "2026-10-01",
			lastChangeOn: "2026-10-01",
			createdAt: "2026-10-01T00:00:00Z",
			category: "health",
		});
		await addSubscription(owner, loaded.userId, {
			name: "Starts soon",
			amountMinor: 50000,
			startDate: "2026-12-05",
			chargesFrom: "2026-12-05",
			lastChangeOn: "2026-11-02",
			createdAt: "2026-11-02T00:00:00Z",
			category: "health",
		});
	});
	await variant("deleted", async (loaded) => {
		const id = loaded.subscription("cultGym");
		await ownerExec(
			owner,
			"DELETE FROM app.subscription_skips WHERE subscription_id = $1",
			[id],
		);
		await ownerExec(owner, "DELETE FROM app.subscriptions WHERE id = $1", [id]);
	});
	const ties = await createUser(owner, "sub-reads-ties");
	await insertProfile(owner, ties);
	users.push(ties);
	await addSubscription(owner, ties, {
		name: "b-sub",
		startDate: "2026-11-05",
		chargesFrom: "2026-11-05",
	});
	await addSubscription(owner, ties, {
		name: "A-sub",
		startDate: "2026-11-05",
		chargesFrom: "2026-11-05",
	});
	variants["ties"] = { userId: ties } as LoadedGolden;
}, 120_000);

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

const list = (who: string) =>
	asUser(who, (tx) => listSubscriptions(tx, goldenContext(who)));
const listOf = async (who: string) => (await list(who)).result;

describe("listSubscriptions on golden (AC-F05-02, AC-F05-24)", () => {
	test("answers every Subscription as an item, oldest first, in one statement", async () => {
		const { result, statements } = await list(golden.userId);
		expect(statements).toBe(1);
		expect(result.items.map((item) => item.name)).toEqual([
			"Sunrise Apartments",
			"Netflix",
			"Cult Gym",
			"Amazon Prime",
		]);
	});

	test("an item carries the stored fields and the derived ones: golden Netflix", async () => {
		const { items } = await listOf(golden.userId);
		expect(items.find((item) => item.name === "Netflix")).toEqual({
			id: golden.subscription("netflix"),
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
			createdAt: "2026-09-04T18:30:00.000Z",
			updatedAt: "2026-09-04T18:30:00.000Z",
			skips: [],
			status: "active",
			nextDueOn: "2026-11-05",
			yearlyMinor: 778800,
			monthlyMinor: 64900,
			chargeCount: 2,
			paidMinor: 129800,
		});
	});

	// golden: Subscriptions (as of 2 November).
	test.each([
		["Netflix", "2026-11-05", 778800, 64900],
		["Cult Gym", "2026-11-10", 1800000, 150000],
		["Sunrise Apartments", "2026-12-01", 21600000, 1800000],
		["Amazon Prime", "2027-10-12", 149900, 12492],
	])(
		"%s: next due %s, %i a year, %i a month",
		async (name, nextDueOn, yearly, monthly) => {
			const { items } = await listOf(golden.userId);
			expect(items.find((item) => item.name === name)).toMatchObject({
				status: "active",
				nextDueOn,
				yearlyMinor: yearly,
				monthlyMinor: monthly,
			});
		},
	);

	// F05 section 5: "Paid so far 1,298.00 · 2 charges", "1,500.00 · 1 charge".
	test.each([
		["Netflix", 2, 129800],
		["Cult Gym", 1, 150000],
		["Sunrise Apartments", 3, 5400000],
		["Amazon Prime", 1, 149900],
	])(
		"%s has %i charges paying %i so far",
		async (name, chargeCount, paidMinor) => {
			const { items } = await listOf(golden.userId);
			expect(items.find((item) => item.name === name)).toMatchObject({
				chargeCount,
				paidMinor,
			});
		},
	);

	// AC-F05-24: the Cult Gym item's skips is ["2026-10-10"].
	test("Cult Gym carries its tombstone in skips, the others none", async () => {
		const { items } = await listOf(golden.userId);
		expect(items.map((item) => [item.name, item.skips])).toEqual([
			["Sunrise Apartments", []],
			["Netflix", []],
			["Cult Gym", ["2026-10-10"]],
			["Amazon Prime", []],
		]);
	});

	test("the page totals: 243,287.00 a year, 20,273.92 a month, over 4 Subscriptions", async () => {
		expect((await listOf(golden.userId)).totals).toEqual({
			yearlyMinor: 24328700,
			monthlyMinor: 2027392,
			count: 4,
		});
	});

	test("the next 30 days: Netflix 5 Nov, Cult Gym 10 Nov, Sunrise Apartments 1 Dec, 20,149.00", async () => {
		const { upcoming, upcomingTotalMinor } = await listOf(golden.userId);
		expect(upcoming.map((entry) => [entry.dueOn, entry.amountMinor])).toEqual([
			["2026-11-05", 64900],
			["2026-11-10", 150000],
			["2026-12-01", 1800000],
		]);
		expect(upcoming.map((entry) => entry.subscriptionId)).toEqual([
			golden.subscription("netflix"),
			golden.subscription("cultGym"),
			golden.subscription("sunrise"),
		]);
		expect(upcomingTotalMinor).toBe(2014900);
	});

	test("this month: charged 18,000.00, still to come 2,149.00", async () => {
		expect((await listOf(golden.userId)).thisMonth).toEqual({
			chargedMinor: 1800000,
			toComeMinor: 214900,
		});
	});

	test("answers the profile currency", async () => {
		expect((await listOf(golden.userId)).currency).toBe("INR");
	});

	test("shows only the user's own Subscriptions: a golden neighbour changes nothing", async () => {
		const mine = await listOf(golden.userId);
		const theirs = await listOf(neighbour.userId);
		expect(theirs.items).toHaveLength(4);
		expect(theirs.totals).toEqual(mine.totals);
		expect(theirs.thisMonth).toEqual(mine.thisMonth);
		const mineIds = new Set(mine.items.map((item) => item.id));
		expect(theirs.items.some((item) => mineIds.has(item.id))).toBe(false);
		expect(theirs.items.map((item) => item.id)).toContain(
			neighbour.subscription("netflix"),
		);
	});
});

describe("listSubscriptions with nothing", () => {
	test("a user with a profile and no Subscriptions has empty figures", async () => {
		expect(await listOf(empty)).toEqual({
			items: [],
			totals: { yearlyMinor: 0, monthlyMinor: 0, count: 0 },
			upcoming: [],
			upcomingTotalMinor: 0,
			thisMonth: { chargedMinor: 0, toComeMinor: 0 },
			currency: "INR",
		});
	});
});

describe("listSubscriptions around catch-up (AC-F05-03)", () => {
	test("before #27 exists, Sunrise Apartments has two charges, November is uncharged, and its next due is 1 December", async () => {
		const loaded = variants["before-catch-up"] as LoadedGolden;
		const result = await listOf(loaded.userId);
		expect(
			result.items.find((item) => item.name === "Sunrise Apartments"),
		).toMatchObject({
			chargeCount: 2,
			paidMinor: 3600000,
			nextDueOn: "2026-12-01",
		});
		expect(result.thisMonth).toEqual({ chargedMinor: 0, toComeMinor: 214900 });
	});
});

describe("status and next due", () => {
	// F05 section 5: Pause "2 charges" gives status paused, next due 5 January 2027, the monthly
	// cost stays 20,273.92 and the next 30 days total 19,500.00.
	test("golden pause: Netflix is paused, next due 5 January 2027, the costs stay, the next 30 days are 19,500.00", async () => {
		const result = await listOf((variants["paused"] as LoadedGolden).userId);
		expect(result.items.find((item) => item.name === "Netflix")).toMatchObject({
			status: "paused",
			nextDueOn: "2027-01-05",
			pause: { from: "2026-11-05", until: "2027-01-05" },
		});
		expect(result.totals).toEqual({
			yearlyMinor: 24328700,
			monthlyMinor: 2027392,
			count: 4,
		});
		expect(result.upcomingTotalMinor).toBe(1950000);
		expect(result.thisMonth.toComeMinor).toBe(150000);
	});

	// F05 section 5: skipping Netflix's 5 November moves next due to 5 December and the next 30
	// days to 19,500.00; November's still to come is 1,500.00.
	test("golden skip: Netflix's next due is 5 December, the next 30 days are 19,500.00", async () => {
		const result = await listOf((variants["skipped"] as LoadedGolden).userId);
		expect(result.items.find((item) => item.name === "Netflix")).toMatchObject({
			status: "active",
			nextDueOn: "2026-12-05",
			skips: ["2026-11-05"],
		});
		expect(result.upcomingTotalMinor).toBe(1950000);
		expect(result.upcoming.map((entry) => entry.dueOn)).toEqual([
			"2026-11-10",
			"2026-12-01",
		]);
		expect(result.thisMonth.toComeMinor).toBe(150000);
	});

	// F05 section 7.4: Netflix cancelled with 30 September, #16 deleted: ended.
	test("a cancelled Subscription is ended with no next due, and drops out of the totals and the upcoming list", async () => {
		const result = await listOf((variants["cancelled"] as LoadedGolden).userId);
		expect(result.items.find((item) => item.name === "Netflix")).toMatchObject({
			status: "ended",
			nextDueOn: null,
			endDate: "2026-09-30",
			chargeCount: 1,
			paidMinor: 64900,
		});
		expect(result.totals).toEqual({
			yearlyMinor: 24328700 - 778800,
			monthlyMinor: 1962492,
			count: 3,
		});
		expect(result.upcoming.map((entry) => entry.dueOn)).toEqual([
			"2026-11-10",
			"2026-12-01",
		]);
	});

	// D-597: an end date of today is ended.
	test("an end date of today is ended, with no date left to charge", async () => {
		const result = await listOf(
			(variants["ended-today"] as LoadedGolden).userId,
		);
		expect(result.items.find((item) => item.name === "Netflix")).toMatchObject({
			status: "ended",
			nextDueOn: null,
		});
		expect(result.upcoming.map((entry) => entry.subscriptionId)).not.toContain(
			(variants["ended-today"] as LoadedGolden).subscription("netflix"),
		);
	});

	test("a future end date is ending and still charges until it", async () => {
		const result = await listOf((variants["ending"] as LoadedGolden).userId);
		expect(result.items.find((item) => item.name === "Netflix")).toMatchObject({
			status: "ending",
			nextDueOn: "2026-11-05",
		});
		expect(result.upcoming.map((entry) => entry.dueOn)).toEqual([
			"2026-11-05",
			"2026-11-10",
			"2026-12-01",
		]);
	});

	test("a weekly Subscription counts its own yearly cost and repeats in the upcoming list; an upcoming one counts in the totals", async () => {
		const result = await listOf((variants["extra"] as LoadedGolden).userId);
		expect(
			result.items.find((item) => item.name === "Gym weekly"),
		).toMatchObject({
			status: "active",
			nextDueOn: "2026-11-05",
			yearlyMinor: 624000,
			monthlyMinor: 52000,
			chargeCount: 0,
			paidMinor: 0,
		});
		expect(
			result.items.find((item) => item.name === "Starts soon"),
		).toMatchObject({
			status: "upcoming",
			nextDueOn: "2026-12-05",
			yearlyMinor: 600000,
		});
		// 24,328,700 + 624,000 + 600,000, all counted: they have a next due date.
		expect(result.totals).toEqual({
			yearlyMinor: 25552700,
			monthlyMinor: 2129392,
			count: 6,
		});
		const weekly = result.upcoming.filter(
			(entry) => entry.amountMinor === 12000,
		);
		expect(weekly.map((entry) => entry.dueOn)).toEqual([
			"2026-11-05",
			"2026-11-12",
			"2026-11-19",
			"2026-11-26",
		]);
	});

	test("a deleted Subscription leaves the list, though its charge stays in this month's figure", async () => {
		const loaded = variants["deleted"] as LoadedGolden;
		const result = await listOf(loaded.userId);
		expect(result.items.map((item) => item.name)).toEqual([
			"Sunrise Apartments",
			"Netflix",
			"Amazon Prime",
		]);
		expect(result.totals.count).toBe(3);
		// Cult Gym's 10 September charge is not this month's; November is unchanged.
		expect(result.thisMonth.chargedMinor).toBe(1800000);
		expect(result.thisMonth.toComeMinor).toBe(64900);
	});
});

describe("getSubscriptionItem", () => {
	const get = (who: string, id: string) =>
		asUser(who, (tx) => getSubscriptionItem(tx, goldenContext(who), id));

	test("answers the same item the list does, in one statement", async () => {
		const id = golden.subscription("cultGym");
		const { result, statements } = await get(golden.userId, id);
		expect(statements).toBe(1);
		const { items } = await listOf(golden.userId);
		expect(result).toEqual(items.find((item) => item.id === id));
		expect(result).toMatchObject({
			skips: ["2026-10-10"],
			chargeCount: 1,
			paidMinor: 150000,
		});
	});

	test("is null for another user's id: RLS hides it", async () => {
		const theirs = neighbour.subscription("netflix");
		expect((await get(golden.userId, theirs)).result).toBeNull();
	});

	test("is null for an id nobody has", async () => {
		expect(
			(await get(golden.userId, "0199a000-0000-7000-8002-0000000000ff"))
				.result,
		).toBeNull();
	});
});

describe("upcomingDue (BR-F05-20)", () => {
	const due = (days: number, who = golden.userId) =>
		asUser(who, (tx) => upcomingDue(tx, goldenContext(who), days));

	test("30 days is the page's list, in one statement", async () => {
		const { result, statements } = await due(30);
		expect(statements).toBe(1);
		expect(result.entries).toEqual((await listOf(golden.userId)).upcoming);
		expect(result.totalMinor).toBe(2014900);
	});

	// golden: renewals within 7 days: Netflix only.
	test("7 days is Netflix only; Cult Gym on 10 November is just outside", async () => {
		const { result } = await due(7);
		expect(result.entries).toEqual([
			{
				subscriptionId: golden.subscription("netflix"),
				dueOn: "2026-11-05",
				amountMinor: 64900,
			},
		]);
		expect(result.totalMinor).toBe(64900);
	});

	test("8 days reaches 10 November: Cult Gym joins", async () => {
		expect((await due(8)).result.entries.map((entry) => entry.dueOn)).toEqual([
			"2026-11-05",
			"2026-11-10",
		]);
	});

	test("0 days is today alone: nothing on golden", async () => {
		expect((await due(0)).result).toEqual({ entries: [], totalMinor: 0 });
	});

	test("a user with none has none", async () => {
		expect((await due(30, empty)).result).toEqual({
			entries: [],
			totalMinor: 0,
		});
	});
});

describe("subscriptionCosts (BR-F05-17)", () => {
	test("golden: 243,287.00 a year and 20,273.92 a month, in one statement", async () => {
		const { result, statements } = await asUser(golden.userId, (tx) =>
			subscriptionCosts(tx, goldenContext(golden.userId)),
		);
		expect(statements).toBe(1);
		expect(result).toEqual({
			yearlyMinor: 24328700,
			monthlyMinor: 2027392,
			count: 4,
		});
	});

	test("a paused Subscription still counts; an ended one does not", async () => {
		const paused = variants["paused"] as LoadedGolden;
		const cancelled = variants["cancelled"] as LoadedGolden;
		const costs = (who: string) =>
			asUser(who, (tx) => subscriptionCosts(tx, goldenContext(who)));
		expect((await costs(paused.userId)).result.count).toBe(4);
		expect((await costs(cancelled.userId)).result.count).toBe(3);
	});

	test("a user with none costs nothing", async () => {
		expect(
			(
				await asUser(empty, (tx) =>
					subscriptionCosts(tx, goldenContext(empty)),
				)
			).result,
		).toEqual({ yearlyMinor: 0, monthlyMinor: 0, count: 0 });
	});
});

describe("subscriptionSummary (F08's Coming up widget)", () => {
	const summary = (who: string) =>
		asUser(who, (tx) => subscriptionSummary(tx, goldenContext(who)));

	// AC-F05-55
	test("golden: the costs and the four renewals, one for each Subscription, in due order", async () => {
		const { result, statements } = await summary(golden.userId);
		expect(statements).toBe(1);
		expect(result).toEqual({
			yearlyMinor: 24328700,
			monthlyMinor: 2027392,
			count: 4,
			upcoming: [
				{
					subscriptionId: golden.subscription("netflix"),
					name: "Netflix",
					dueOn: "2026-11-05",
					amountMinor: 64900,
				},
				{
					subscriptionId: golden.subscription("cultGym"),
					name: "Cult Gym",
					dueOn: "2026-11-10",
					amountMinor: 150000,
				},
				{
					subscriptionId: golden.subscription("sunrise"),
					name: "Sunrise Apartments",
					dueOn: "2026-12-01",
					amountMinor: 1800000,
				},
				{
					subscriptionId: golden.subscription("amazonPrime"),
					name: "Amazon Prime",
					dueOn: "2027-10-12",
					amountMinor: 149900,
				},
			],
		});
	});

	test("skipping Netflix's 5 November makes Cult Gym's 10 November the next renewal", async () => {
		const { result } = await summary(
			(variants["skipped"] as LoadedGolden).userId,
		);
		expect(result.upcoming[0]).toMatchObject({
			name: "Cult Gym",
			dueOn: "2026-11-10",
			amountMinor: 150000,
		});
		// Netflix's next due date is now 5 December: it is still listed, after Sunrise's 1 December.
		expect(result.upcoming.map((entry) => entry.name)).toEqual([
			"Cult Gym",
			"Sunrise Apartments",
			"Netflix",
			"Amazon Prime",
		]);
	});

	test("a paused Netflix leaves Cult Gym as the next renewal, though it still counts in the cost", async () => {
		const { result } = await summary(
			(variants["paused"] as LoadedGolden).userId,
		);
		expect(result.upcoming[0]).toMatchObject({ name: "Cult Gym" });
		expect(result.count).toBe(4);
	});

	test("two Subscriptions due the same day: the earlier name first, case aside", async () => {
		const { result } = await summary((variants["ties"] as LoadedGolden).userId);
		expect(result.upcoming.map((entry) => entry.name)).toEqual([
			"A-sub",
			"b-sub",
		]);
		expect(result.upcoming[0]).toMatchObject({ dueOn: "2026-11-05" });
		expect(result.count).toBe(2);
	});

	test("with none, no renewal and zero costs", async () => {
		expect((await summary(empty)).result).toEqual({
			yearlyMinor: 0,
			monthlyMinor: 0,
			count: 0,
			upcoming: [],
		});
	});

	test("with every Subscription ended, no renewal but a zero cost and a zero count", async () => {
		const loaded = await goldenUser(owner, "sub-reads-all-ended");
		users.push(loaded.userId);
		await ownerExec(
			owner,
			"UPDATE app.subscriptions SET end_date = '2026-10-31' WHERE user_id = $1",
			[loaded.userId],
		);
		const { result } = await summary(loaded.userId);
		expect(result).toEqual({
			yearlyMinor: 0,
			monthlyMinor: 0,
			count: 0,
			upcoming: [],
		});
	});

	test("lists only four of five Subscriptions, the one due last left out", async () => {
		const loaded = await goldenUser(owner, "sub-reads-five");
		users.push(loaded.userId);
		await addSubscription(owner, loaded.userId, {
			name: "Fifth",
			startDate: "2026-11-20",
			chargesFrom: "2026-11-20",
			lastChangeOn: "2026-11-02",
		});
		const { result } = await summary(loaded.userId);
		expect(result.upcoming).toHaveLength(4);
		expect(result.count).toBe(5);
		expect(result.upcoming.map((entry) => entry.name)).not.toContain(
			"Amazon Prime",
		);
	});

	test("an ended Subscription is neither listed nor counted", async () => {
		const loaded = await goldenUser(owner, "sub-reads-one-ended");
		users.push(loaded.userId);
		await ownerExec(
			owner,
			"UPDATE app.subscriptions SET end_date = '2026-10-31' WHERE id = $1",
			[loaded.subscription("netflix")],
		);
		const { result } = await summary(loaded.userId);
		expect(result.upcoming.map((entry) => entry.name)).toEqual([
			"Cult Gym",
			"Sunrise Apartments",
			"Amazon Prime",
		]);
		expect(result.count).toBe(3);
	});

	test("never lists another user's Subscriptions", async () => {
		const { result } = await summary(empty);
		expect(result.upcoming).toEqual([]);
	});
});

describe("charges of other users or unlinked", () => {
	test("an unlinked charge of the same name is not counted for a Subscription", async () => {
		const loaded = await goldenUser(owner, "sub-reads-unlinked");
		users.push(loaded.userId);
		await addCharge(owner, loaded.userId, {
			subscriptionId: null,
			dueOn: "2026-10-20",
		});
		const { items } = await listOf(loaded.userId);
		expect(items.find((item) => item.name === "Netflix")).toMatchObject({
			chargeCount: 2,
			paidMinor: 129800,
		});
	});
});
