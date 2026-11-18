import { skipToken } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { createQueryClient } from "@/lib/api/query-client";
import { budgetKeys } from "../keys";
import {
	budgetHistoryOptions,
	budgetMonthOptions,
	budgetYearOptions,
	PANEL_MONTHS,
	payeeSummaryOptions,
	TOP_PAYEES,
} from "../queries";
import { monthAnswer, payeeSummary } from "./fixtures";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

/** Answers `body` for `path`, and records each request's path, query and method. */
function answer(path: string, body: unknown) {
	const seen: { path: string; headers: Headers }[] = [];
	network.use(
		http.get(new URL(path, window.location.origin).toString(), ({ request }) => {
			const url = new URL(request.url);
			seen.push({
				path: `${url.pathname}${url.search}`,
				headers: request.headers,
			});
			return HttpResponse.json({ data: body });
		}),
	);
	return seen;
}

function client() {
	const queryClient = createQueryClient();
	queryClient.setDefaultOptions({ queries: { retry: false } });
	return queryClient;
}

describe("the constants (BR-F04-30)", () => {
	test("the panel shows the last 6 months and the top 3 payees", () => {
		expect(PANEL_MONTHS).toBe(6);
		expect(TOP_PAYEES).toBe(3);
	});
});

describe("budgetMonthOptions", () => {
	test("reads one month's view under its key, with no write headers", async () => {
		const october = monthAnswer("2026-10");
		const seen = answer("/api/budgets", october);
		const options = budgetMonthOptions("2026-10");
		expect(options.queryKey).toEqual(budgetKeys.month("2026-10"));
		expect(await client().fetchQuery(options)).toEqual(october);
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets?month=2026-10",
		]);
		expect(seen[0]?.headers.get("idempotency-key")).toBeNull();
		expect(seen[0]?.headers.get("if-match")).toBeNull();
	});
});

describe("budgetHistoryOptions", () => {
	test("reads one category's months under its key", async () => {
		const history = {
			category: "food",
			currency: "INR",
			months: [{ month: "2026-11", limitMinor: 500000, spentMinor: 42000 }],
		};
		const seen = answer("/api/budgets/history", history);
		const options = budgetHistoryOptions({
			category: "food",
			to: "2026-11",
			months: 6,
		});
		expect(options.queryKey).toEqual(budgetKeys.history("food", "2026-11", 6));
		expect(await client().fetchQuery(options)).toEqual(history);
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets/history?category=food&to=2026-11&months=6",
		]);
	});

	test("with no category it has no request to make", () => {
		const options = budgetHistoryOptions({
			category: null,
			to: "2026-11",
			months: 6,
		});
		expect(options.queryFn).toBe(skipToken);
		expect(options.queryKey).toEqual(budgetKeys.history(null, "2026-11", 6));
	});
});

describe("budgetYearOptions", () => {
	test("reads the year summary under its key", async () => {
		const year = {
			year: 2026,
			months: [{ month: "2026-09", utilizationTenths: 810 }],
		};
		const seen = answer("/api/budgets/summary", year);
		const options = budgetYearOptions(2026);
		expect(options.queryKey).toEqual(budgetKeys.year(2026));
		expect(await client().fetchQuery(options)).toEqual(year);
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets/summary?year=2026",
		]);
	});
});

describe("payeeSummaryOptions", () => {
	test("reads F03's summary of the category's month, by payee, under a Budgets key", async () => {
		const summary = payeeSummary();
		const seen = answer("/api/transactions/summary", summary);
		const options = payeeSummaryOptions({
			category: "food",
			month: "2026-10",
			currency: "INR",
		});
		expect(options.queryKey).toEqual(budgetKeys.payees("food", "2026-10"));
		expect(await client().fetchQuery(options)).toEqual(summary);
		expect(seen.map((each) => each.path)).toEqual([
			"/api/transactions/summary?from=2026-10-01&to=2026-10-31&cat=food&by=payee",
		]);
	});

	test("the currency is not part of the key", () => {
		const inr = payeeSummaryOptions({
			category: "food",
			month: "2026-10",
			currency: "INR",
		});
		const jpy = payeeSummaryOptions({
			category: "food",
			month: "2026-10",
			currency: "JPY",
		});
		expect(jpy.queryKey).toEqual(inr.queryKey);
	});

	test("with no category it has no request to make", () => {
		const options = payeeSummaryOptions({
			category: null,
			month: "2026-10",
			currency: "INR",
		});
		expect(options.queryFn).toBe(skipToken);
	});
});
