import { type QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, test } from "vitest";

import { ME_KEY } from "@/lib/api/me";
import { createQueryClient } from "@/lib/api/query-client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { budgetKeys } from "../keys";
import { type BudgetWrite, refreshAfterBudgetWrite } from "../refresh";

const KEYS = {
	october: budgetKeys.month("2026-10"),
	november: budgetKeys.month("2026-11"),
	history: budgetKeys.history("food", "2026-10", 6),
	preview: budgetKeys.history("food", "2026-11", 37),
	year: budgetKeys.year(2026),
	payees: budgetKeys.payees("food", "2026-10"),
	profile: [QUERY_ROOTS.profile],
	me: ME_KEY,
	transactions: [QUERY_ROOTS.transactions, "list"],
	payeeList: [QUERY_ROOTS.payees, "list"],
	views: [QUERY_ROOTS.transactionViews, "list"],
} as const;

type Name = keyof typeof KEYS;

const BUDGET_READS = [
	"october",
	"november",
	"history",
	"preview",
	"year",
	"payees",
] as const;

let unsubscribe: (() => void)[] = [];
afterEach(() => {
	for (const stop of unsubscribe) stop();
	unsubscribe = [];
});

/** A client holding one fresh answer under every key, each watched like a mounted page unless
 * named in `idle`, and a count of the fetches each key makes from now on. */
function seeded(idle: readonly Name[] = []) {
	const queryClient = createQueryClient();
	const fetched = new Map<Name, number>();
	for (const [name, queryKey] of Object.entries(KEYS) as [
		Name,
		readonly unknown[],
	][]) {
		queryClient.setQueryData(queryKey, { seeded: name });
		if (idle.includes(name)) continue;
		const observer = new QueryObserver(queryClient, {
			queryKey,
			queryFn: () => {
				fetched.set(name, (fetched.get(name) ?? 0) + 1);
				return { refetched: name };
			},
			staleTime: Infinity,
		});
		unsubscribe.push(observer.subscribe(() => {}));
	}
	return { queryClient, fetched };
}

const stateOf = (queryClient: QueryClient, name: Name) =>
	queryClient.getQueryState(KEYS[name]);

describe("refreshAfterBudgetWrite (F04 section 12, STATE-5)", () => {
	test.each(
		(["count", "rules"] as BudgetWrite[]).flatMap((write) =>
			BUDGET_READS.map((name) => [write, name] as const),
		),
	)("a %s write refetches the Budgets read %s", async (write, name) => {
		const { queryClient, fetched } = seeded();
		await refreshAfterBudgetWrite(queryClient, write);
		expect(fetched.get(name)).toBe(1);
	});

	test("a write that changes the number of Budgets refetches the profile, whose currency lock counts them (BR-F02-14)", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterBudgetWrite(queryClient, "count");
		expect(fetched.get("profile")).toBe(1);
	});

	test("a change to a Budget's limits leaves the profile alone", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterBudgetWrite(queryClient, "rules");
		expect(fetched.get("profile")).toBeUndefined();
		expect(stateOf(queryClient, "profile")?.isInvalidated).toBe(false);
	});

	test.each(["count", "rules"] as BudgetWrite[])(
		"a %s write leaves Transactions, payees, saved views and /api/me alone, since a Budget moves none of them",
		async (write) => {
			const { queryClient, fetched } = seeded();
			await refreshAfterBudgetWrite(queryClient, write);
			for (const name of [
				"transactions",
				"payeeList",
				"views",
				"me",
			] as const) {
				expect(fetched.get(name)).toBeUndefined();
				expect(stateOf(queryClient, name)?.isInvalidated).toBe(false);
			}
		},
	);

	test("a read no page shows is marked stale, not fetched, until a page shows it", async () => {
		const { queryClient, fetched } = seeded(["november", "year"]);
		await refreshAfterBudgetWrite(queryClient, "rules");
		expect(fetched.get("november")).toBeUndefined();
		expect(stateOf(queryClient, "november")?.isInvalidated).toBe(true);
		expect(stateOf(queryClient, "year")?.isInvalidated).toBe(true);
	});

	test("settles only once the page's reads have refetched, so the notice never sits beside old figures", async () => {
		const queryClient = createQueryClient();
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		queryClient.setQueryData(KEYS.october, { seeded: true });
		const observer = new QueryObserver(queryClient, {
			queryKey: KEYS.october,
			queryFn: () => slow.then(() => ({ refetched: true })),
			staleTime: Infinity,
		});
		unsubscribe.push(observer.subscribe(() => {}));
		let settled = false;
		const refresh = refreshAfterBudgetWrite(queryClient, "rules").then(() => {
			settled = true;
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await refresh;
		expect(settled).toBe(true);
		expect(queryClient.getQueryData(KEYS.october)).toEqual({ refetched: true });
	});

	test("a refetch that fails still lets the write settle, keeping the figures it had", async () => {
		const queryClient = createQueryClient();
		queryClient.setQueryData(KEYS.october, { seeded: true });
		const observer = new QueryObserver(queryClient, {
			queryKey: KEYS.october,
			queryFn: () => Promise.reject(new Error("offline")),
			staleTime: Infinity,
			retry: false,
		});
		unsubscribe.push(observer.subscribe(() => {}));
		await expect(
			refreshAfterBudgetWrite(queryClient, "rules"),
		).resolves.toBeUndefined();
		expect(queryClient.getQueryData(KEYS.october)).toEqual({ seeded: true });
	});
});
