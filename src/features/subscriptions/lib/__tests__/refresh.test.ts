import { type QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ME_KEY } from "@/lib/api/me";
import { createQueryClient } from "@/lib/api/query-client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { subscriptionKeys } from "../keys";
import {
	chargesChanged,
	refreshAfterSubscriptionWrite,
	type SubscriptionWrite,
} from "../refresh";

const KEYS = {
	list: subscriptionKeys.list(),
	months: subscriptionKeys.months("2026-10", "2026-12"),
	monthCharges: subscriptionKeys.monthCharges("2026-11"),
	charges: subscriptionKeys.charges("abc"),
	duplicates: subscriptionKeys.duplicates("Netflix", "2025-09-05", "2026-11-01"),
	transactions: [QUERY_ROOTS.transactions, "list", {}],
	payees: [QUERY_ROOTS.payees, "list"],
	budgets: [QUERY_ROOTS.budgets, "month", "2026-11"],
	profile: [QUERY_ROOTS.profile],
	views: [QUERY_ROOTS.transactionViews, "list"],
	me: ME_KEY,
} as const;

type Name = keyof typeof KEYS;

const SUBSCRIPTIONS: Name[] = [
	"list",
	"months",
	"monthCharges",
	"charges",
	"duplicates",
];
const CHARGE_READS: Name[] = ["transactions", "payees", "budgets"];

let stops: (() => void)[] = [];
afterEach(() => {
	for (const stop of stops) stop();
	stops = [];
});

/** A client holding one fresh answer under every key, each watched like a mounted page, and
 * a count of the fetches each key makes from now on. */
function seeded() {
	const queryClient = createQueryClient();
	const fetched = new Map<Name, number>();
	for (const [name, queryKey] of Object.entries(KEYS) as [
		Name,
		readonly unknown[],
	][]) {
		queryClient.setQueryData(queryKey, { seeded: name });
		const observer = new QueryObserver(queryClient, {
			queryKey,
			queryFn: () => {
				fetched.set(name, (fetched.get(name) ?? 0) + 1);
				return { refetched: name };
			},
			staleTime: Infinity,
		});
		stops.push(observer.subscribe(() => {}));
	}
	const refetched = () =>
		(Object.keys(KEYS) as Name[]).filter((name) => (fetched.get(name) ?? 0) > 0);
	return { queryClient, refetched };
}

async function refreshed(write: SubscriptionWrite) {
	const { queryClient, refetched } = seeded();
	await refreshAfterSubscriptionWrite(queryClient, write);
	return refetched();
}

describe("chargesChanged (BR-F05-08)", () => {
	test("an answer with no count and no month changed no charge", () => {
		expect(chargesChanged({})).toBe(false);
		expect(
			chargesChanged({
				chargesCreated: 0,
				chargesUpdated: 0,
				chargesDeleted: 0,
				chargesKept: 0,
				months: [],
			}),
		).toBe(false);
	});

	test.each([
		["created", { chargesCreated: 1 }],
		["repriced", { chargesUpdated: 2 }],
		["deleted", { chargesDeleted: 3 }],
		["kept as unlinked expenses", { chargesKept: 2 }],
		["a month listed", { months: ["2026-11"] }],
	] as const)("%s is a change", (_what, counts) => {
		expect(chargesChanged(counts)).toBe(true);
	});

	test("a change with every count 0 but a month still counts", () => {
		expect(
			chargesChanged({
				chargesCreated: 0,
				chargesUpdated: 0,
				chargesDeleted: 0,
				months: ["2026-09", "2026-10"],
			}),
		).toBe(true);
	});
});

describe("refreshAfterSubscriptionWrite (F05 section 12)", () => {
	// AC-F05-18: a skip changes no charge.
	test("a write that changed no charge refreshes the Subscriptions reads only", async () => {
		expect(await refreshed({ count: false, charges: false })).toEqual(
			SUBSCRIPTIONS,
		);
	});

	test("a write that changed charges also refreshes Transactions, payees and Budgets", async () => {
		expect(await refreshed({ count: false, charges: true })).toEqual([
			...SUBSCRIPTIONS,
			...CHARGE_READS,
		]);
	});

	test("a create or delete also refreshes the profile, whose currency lock counts Subscriptions (BR-F02-14)", async () => {
		expect(await refreshed({ count: true, charges: false })).toEqual([
			...SUBSCRIPTIONS,
			"profile",
		]);
	});

	test("a create with backfill refreshes all of them", async () => {
		expect(await refreshed({ count: true, charges: true })).toEqual([
			...SUBSCRIPTIONS,
			...CHARGE_READS,
			"profile",
		]);
	});

	test("never refreshes the session or the saved views, which no Subscription write touches", async () => {
		const all = await refreshed({ count: true, charges: true });
		expect(all).not.toContain("me");
		expect(all).not.toContain("views");
	});

	test("settles only once the refetches have", async () => {
		const queryClient: QueryClient = createQueryClient();
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		queryClient.setQueryData(subscriptionKeys.list(), { seeded: true });
		stops.push(
			new QueryObserver(queryClient, {
				queryKey: subscriptionKeys.list(),
				queryFn: () => slow.then(() => ({ refetched: true })),
				staleTime: Infinity,
			}).subscribe(() => {}),
		);
		let done = false;
		const pending = refreshAfterSubscriptionWrite(queryClient, {
			count: false,
			charges: false,
		}).then(() => {
			done = true;
		});
		await vi.waitFor(() =>
			expect(
				queryClient.isFetching({ queryKey: subscriptionKeys.list() }),
			).toBe(1),
		);
		expect(done).toBe(false);
		release();
		await pending;
		expect(done).toBe(true);
		expect(queryClient.getQueryData(subscriptionKeys.list())).toEqual({
			refetched: true,
		});
	});
});
