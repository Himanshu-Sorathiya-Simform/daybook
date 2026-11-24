import { QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, test } from "vitest";

import { ME_KEY } from "../me";
import { createQueryClient } from "../query-client";
import { QUERY_ROOTS } from "../query-keys";
import { refreshAfterChargeChange } from "../refresh";

const KEYS = {
	subscriptionList: [QUERY_ROOTS.subscriptions, "list"],
	subscriptionCharges: [QUERY_ROOTS.subscriptions, "charges", "abc"],
	transactionList: [QUERY_ROOTS.transactions, "list", {}],
	transactionSummary: [QUERY_ROOTS.transactions, "summary", {}],
	payees: [QUERY_ROOTS.payees, "list"],
	budgetMonth: [QUERY_ROOTS.budgets, "month", "2026-11"],
	budgetHistory: [QUERY_ROOTS.budgets, "history", "food", "2026-10", 6],
	profile: [QUERY_ROOTS.profile],
	views: [QUERY_ROOTS.transactionViews, "list"],
	me: ME_KEY,
} as const;

type Name = keyof typeof KEYS;

let stops: (() => void)[] = [];
afterEach(() => {
	for (const stop of stops) stop();
	stops = [];
});

function seeded() {
	const queryClient = createQueryClient();
	const fetched = new Set<Name>();
	for (const [name, queryKey] of Object.entries(KEYS) as [
		Name,
		readonly unknown[],
	][]) {
		queryClient.setQueryData(queryKey, { seeded: name });
		stops.push(
			new QueryObserver(queryClient, {
				queryKey,
				queryFn: () => {
					fetched.add(name);
					return { refetched: name };
				},
				staleTime: Infinity,
			}).subscribe(() => {}),
		);
	}
	return { queryClient, fetched };
}

describe("refreshAfterChargeChange (F05 sections 7.2 and 12, F03 section 12)", () => {
	test("refreshes every read that holds charges or is drawn from them", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterChargeChange(queryClient);
		expect([...fetched].sort()).toEqual(
			[
				"budgetHistory",
				"budgetMonth",
				"payees",
				"subscriptionCharges",
				"subscriptionList",
				"transactionList",
				"transactionSummary",
			].sort(),
		);
	});

	test("leaves the profile alone, since a charge adds no Subscription", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterChargeChange(queryClient);
		expect(fetched.has("profile")).toBe(false);
	});

	test("leaves the session and the saved views alone", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterChargeChange(queryClient);
		expect(fetched.has("me")).toBe(false);
		expect(fetched.has("views")).toBe(false);
	});

	test("settles only once the refetches have", async () => {
		const queryClient = createQueryClient();
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		queryClient.setQueryData(KEYS.transactionList, { seeded: true });
		stops.push(
			new QueryObserver(queryClient, {
				queryKey: KEYS.transactionList,
				queryFn: () => slow.then(() => ({ refetched: true })),
				staleTime: Infinity,
			}).subscribe(() => {}),
		);
		let done = false;
		const pending = refreshAfterChargeChange(queryClient).then(() => {
			done = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(done).toBe(false);
		release();
		await pending;
		expect(done).toBe(true);
	});

	test("with nothing cached, it settles at once", async () => {
		await expect(
			refreshAfterChargeChange(createQueryClient()),
		).resolves.toBeUndefined();
	});
});
