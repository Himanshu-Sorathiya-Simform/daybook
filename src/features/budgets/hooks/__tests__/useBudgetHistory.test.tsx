import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import type { ExpenseCategory } from "@/lib/budgets/model";
import { budgetKeys } from "../../lib/keys";
import { useBudgetHistory } from "../useBudgetHistory";
import { ok, renderHookInApp, route, testClient } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

// F04 section 5, "History and year summary".
const FOOD = {
	category: "food",
	currency: "INR",
	months: [
		{ month: "2026-06", limitMinor: null, spentMinor: 0 },
		{ month: "2026-07", limitMinor: null, spentMinor: 0 },
		{ month: "2026-08", limitMinor: null, spentMinor: 0 },
		{ month: "2026-09", limitMinor: 600000, spentMinor: 505000 },
		{ month: "2026-10", limitMinor: 500000, spentMinor: 622000 },
		{ month: "2026-11", limitMinor: 500000, spentMinor: 42000 },
	],
};

const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("useBudgetHistory (BR-F04-35)", () => {
	test("reads the last 6 months by default", async () => {
		const seen = route(network, "get", "/api/budgets/history", () => ok(FOOD));
		const { result } = renderHookInApp(() =>
			useBudgetHistory("food", "2026-11"),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(FOOD);
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets/history?category=food&to=2026-11&months=6",
		]);
	});

	test("reads as many months as a preview needs", async () => {
		const seen = route(network, "get", "/api/budgets/history", () => ok(FOOD));
		const { result } = renderHookInApp(() =>
			useBudgetHistory("shopping", "2026-11", 37),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen[0]?.path).toBe(
			"/api/budgets/history?category=shopping&to=2026-11&months=37",
		);
	});

	test("with no category chosen it asks for nothing", async () => {
		const seen = route(network, "get", "/api/budgets/history", () => ok(FOOD));
		const { result } = renderHookInApp(() => useBudgetHistory(null, "2026-11"));
		await wait();
		expect(seen).toHaveLength(0);
		expect(result.current.data).toBeUndefined();
		expect(result.current.fetchStatus).toBe("idle");
	});

	test("with no category it never shows another category's cached months", async () => {
		route(network, "get", "/api/budgets/history", () => ok(FOOD));
		const queryClient = testClient();
		queryClient.setQueryData(budgetKeys.history("food", "2026-11", 6), FOOD);
		const { result } = renderHookInApp(() => useBudgetHistory(null, "2026-11"), {
			queryClient,
		});
		await wait();
		expect(result.current.data).toBeUndefined();
	});

	test("choosing a category starts the read, and a new one asks again", async () => {
		const seen = route(network, "get", "/api/budgets/history", ({ path }) =>
			ok({
				...FOOD,
				category: new URL(path, "http://x").searchParams.get("category"),
			}),
		);
		const { result, rerender } = renderHookInApp(
			({ category }: { category: ExpenseCategory | null }) =>
				useBudgetHistory(category, "2026-10", 2),
			{ initialProps: { category: null as ExpenseCategory | null } },
		);
		await wait();
		expect(seen).toHaveLength(0);
		rerender({ category: "transportation" });
		await waitFor(() =>
			expect(result.current.data?.category).toBe("transportation"),
		);
		rerender({ category: "health" });
		await waitFor(() => expect(result.current.data?.category).toBe("health"));
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets/history?category=transportation&to=2026-10&months=2",
			"/api/budgets/history?category=health&to=2026-10&months=2",
		]);
	});
});
