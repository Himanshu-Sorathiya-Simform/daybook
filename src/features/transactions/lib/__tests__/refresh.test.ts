import { type QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, test } from "vitest";

import { ME_KEY } from "@/lib/api/me";
import { createQueryClient } from "@/lib/api/query-client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { ListParams } from "@/lib/transactions/url";
import { payeeKeys, transactionKeys, viewKeys } from "../keys";
import {
	dropView,
	putView,
	refreshAfterTransactionWrite,
	refreshViews,
} from "../refresh";
import type { ViewsAnswer } from "../types";
import { idOf, row } from "./fixtures";

const LIST: ListParams = { sort: "date", dir: "desc", group: "day" };
const WRITTEN = row({ id: idOf(24), version: 2 });

const KEYS = {
	list: transactionKeys.list({}, LIST),
	otherList: transactionKeys.list({ cat: ["food"] }, LIST),
	summary: transactionKeys.summary({}, ["category", "payee"]),
	facets: transactionKeys.facets({}),
	histogram: transactionKeys.histogram({}),
	written: transactionKeys.detail(idOf(24)),
	otherRow: transactionKeys.detail(idOf(25)),
	payees: payeeKeys.list(),
	search: payeeKeys.search("swi"),
	history: payeeKeys.history("Swiggy", 3),
	views: viewKeys.list(),
	me: ME_KEY,
	profile: [QUERY_ROOTS.profile],
} as const;

type Name = keyof typeof KEYS;

let unsubscribe: (() => void)[] = [];
afterEach(() => {
	for (const stop of unsubscribe) stop();
	unsubscribe = [];
});

/** A client holding one fresh answer under every key, each watched like a mounted page, and a
 * count of the fetches each key makes from now on. */
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
		unsubscribe.push(observer.subscribe(() => {}));
	}
	return { queryClient, fetched };
}

const stateOf = (queryClient: QueryClient, name: Name) =>
	queryClient.getQueryState(KEYS[name]);

describe("refreshAfterTransactionWrite (F03 section 12, STATE-5)", () => {
	test("a create sets the row's own query from the answer, without fetching it", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterTransactionWrite(queryClient, {
			kind: "create",
			row: WRITTEN,
		});
		expect(queryClient.getQueryData(KEYS.written)).toEqual(WRITTEN);
		expect(fetched.get("written")).toBeUndefined();
		expect(stateOf(queryClient, "written")?.isInvalidated).toBe(false);
	});

	test.each([
		"list",
		"otherList",
		"summary",
		"facets",
		"histogram",
		"otherRow",
	] as const)("a create refetches the Transactions read %s", async (name) => {
		const { queryClient, fetched } = seeded();
		await refreshAfterTransactionWrite(queryClient, {
			kind: "create",
			row: WRITTEN,
		});
		expect(fetched.get(name)).toBe(1);
	});

	test.each(["payees", "search", "history"] as const)(
		"a create refetches the payee read %s",
		async (name) => {
			const { queryClient, fetched } = seeded();
			await refreshAfterTransactionWrite(queryClient, {
				kind: "create",
				row: WRITTEN,
			});
			expect(fetched.get(name)).toBe(1);
		},
	);

	test("a create refetches the profile, whose currency lock counts Transactions", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterTransactionWrite(queryClient, {
			kind: "create",
			row: WRITTEN,
		});
		expect(fetched.get("profile")).toBe(1);
	});

	test("a create leaves the saved views and /api/me alone", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterTransactionWrite(queryClient, {
			kind: "create",
			row: WRITTEN,
		});
		expect(fetched.get("views")).toBeUndefined();
		expect(fetched.get("me")).toBeUndefined();
		expect(stateOf(queryClient, "views")?.isInvalidated).toBe(false);
		expect(stateOf(queryClient, "me")?.isInvalidated).toBe(false);
	});

	test("an edit sets its row and refetches the rest, but not the profile", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterTransactionWrite(queryClient, {
			kind: "edit",
			row: WRITTEN,
		});
		expect(queryClient.getQueryData(KEYS.written)).toEqual(WRITTEN);
		expect(fetched.get("written")).toBeUndefined();
		expect(fetched.get("list")).toBe(1);
		expect(fetched.get("payees")).toBe(1);
		expect(fetched.get("profile")).toBeUndefined();
	});

	test("an edit matches its row whatever the id's case", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterTransactionWrite(queryClient, {
			kind: "edit",
			row: { ...WRITTEN, id: idOf(24).toUpperCase() },
		});
		expect(fetched.get("written")).toBeUndefined();
		expect(queryClient.getQueryData(KEYS.written)).toMatchObject({ version: 2 });
	});

	test("a delete drops its row's query, so nothing asks for a row that is gone", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterTransactionWrite(queryClient, {
			kind: "delete",
			id: idOf(24),
		});
		expect(queryClient.getQueryState(KEYS.written)).toBeUndefined();
		expect(fetched.get("written")).toBeUndefined();
	});

	test("a delete refetches the lists, payees and profile, and leaves views alone", async () => {
		const { queryClient, fetched } = seeded();
		await refreshAfterTransactionWrite(queryClient, {
			kind: "delete",
			id: idOf(24),
		});
		expect(fetched.get("list")).toBe(1);
		expect(fetched.get("otherRow")).toBe(1);
		expect(fetched.get("payees")).toBe(1);
		expect(fetched.get("profile")).toBe(1);
		expect(fetched.get("views")).toBeUndefined();
	});

	test("settles only once every refetch has", async () => {
		const queryClient = createQueryClient();
		let release: () => void = () => {};
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		queryClient.setQueryData(KEYS.list, { seeded: true });
		const observer = new QueryObserver(queryClient, {
			queryKey: KEYS.list,
			queryFn: () => slow.then(() => ({ refetched: true })),
			staleTime: Infinity,
		});
		unsubscribe.push(observer.subscribe(() => {}));
		let settled = false;
		const refresh = refreshAfterTransactionWrite(queryClient, {
			kind: "create",
			row: WRITTEN,
		}).then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await refresh;
		expect(settled).toBe(true);
		expect(queryClient.getQueryData(KEYS.list)).toEqual({ refetched: true });
	});

	test("an unwatched read is marked stale, to refetch when next shown", async () => {
		const queryClient = createQueryClient();
		queryClient.setQueryData(KEYS.summary, { seeded: true });
		await refreshAfterTransactionWrite(queryClient, {
			kind: "create",
			row: WRITTEN,
		});
		expect(queryClient.getQueryState(KEYS.summary)?.isInvalidated).toBe(true);
	});
});

describe("refreshViews", () => {
	test("refetches the views list and nothing else", async () => {
		const { queryClient, fetched } = seeded();
		await refreshViews(queryClient);
		expect(fetched.get("views")).toBe(1);
		expect([...fetched.keys()]).toEqual(["views"]);
	});
});

const VIEW = (n: number, name: string) => ({
	id: idOf(n),
	name,
	filter: { cat: ["food" as const] },
	sort: "date" as const,
	dir: "desc" as const,
	group: "day" as const,
	version: 1,
	createdAt: "2026-11-02T06:30:00.000Z",
	updatedAt: "2026-11-02T06:30:00.000Z",
});
const listed = (queryClient: QueryClient) =>
	queryClient.getQueryData<ViewsAnswer>(viewKeys.list());

describe("putView (BR-F03-63, BR-F03-65)", () => {
	function withViews(...items: ReturnType<typeof VIEW>[]) {
		const queryClient = createQueryClient();
		queryClient.setQueryData<ViewsAnswer>(viewKeys.list(), {
			items,
			currency: "INR",
		});
		return queryClient;
	}

	test("a new view joins the list last, without the answer's currency", () => {
		const queryClient = withViews(VIEW(1, "Food"));
		putView(queryClient, { ...VIEW(2, "Rent"), currency: "INR" });
		expect(listed(queryClient)).toEqual({
			items: [VIEW(1, "Food"), VIEW(2, "Rent")],
			currency: "INR",
		});
	});

	test("a changed view takes its own place", () => {
		const queryClient = withViews(VIEW(1, "Food"), VIEW(2, "Rent"));
		putView(queryClient, {
			...VIEW(1, "Eating out"),
			version: 2,
			currency: "INR",
		});
		expect(listed(queryClient)?.items).toEqual([
			{ ...VIEW(1, "Eating out"), version: 2 },
			VIEW(2, "Rent"),
		]);
	});

	test("with no list cached, nothing is written: the list loads whole later", () => {
		const queryClient = createQueryClient();
		putView(queryClient, { ...VIEW(1, "Food"), currency: "INR" });
		expect(listed(queryClient)).toBeUndefined();
	});
});

describe("dropView (BR-F03-69)", () => {
	test("takes the view out and keeps the rest in order", () => {
		const queryClient = createQueryClient();
		queryClient.setQueryData<ViewsAnswer>(viewKeys.list(), {
			items: [VIEW(1, "Food"), VIEW(2, "Rent"), VIEW(3, "Travel")],
			currency: "INR",
		});
		dropView(queryClient, idOf(2));
		expect(listed(queryClient)).toEqual({
			items: [VIEW(1, "Food"), VIEW(3, "Travel")],
			currency: "INR",
		});
	});

	test("with no list cached, nothing is written", () => {
		const queryClient = createQueryClient();
		dropView(queryClient, idOf(2));
		expect(listed(queryClient)).toBeUndefined();
	});
});
