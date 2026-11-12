import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { useTransactionSummary } from "../useTransactionSummary";
import { ok, refuse, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const CHECK_A = { from: "2026-10-01", to: "2026-10-31" };

/** Check A's header at M1, before Goal rows (F03 section 5). */
const CHECK_A_SUMMARY = {
	count: 11,
	incomeMinor: 8500000,
	spendingMinor: 3116800,
	toGoalsMinor: 0,
	firstOn: "2026-10-01",
	lastOn: "2026-10-31",
	currency: "INR",
};

describe("useTransactionSummary (BR-F03-41, BR-F03-71)", () => {
	test("asks once for the totals and both breakdowns, for the header and the panel", async () => {
		const seen = route(network, "get", "/api/transactions/summary", () =>
			ok(CHECK_A_SUMMARY),
		);
		const { result } = renderHookInApp(() =>
			useTransactionSummary({ filter: CHECK_A, currency: "INR" }),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen.map((request) => request.path)).toEqual([
			"/api/transactions/summary?from=2026-10-01&to=2026-10-31&by=category,payee",
		]);
		expect(result.current.data?.spendingMinor).toBe(3116800);
	});

	test("the header and the panel share the one request", async () => {
		const seen = route(network, "get", "/api/transactions/summary", () =>
			ok(CHECK_A_SUMMARY),
		);
		const { result } = renderHookInApp(() => {
			const header = useTransactionSummary({
				filter: CHECK_A,
				currency: "INR",
			});
			const panel = useTransactionSummary({
				filter: CHECK_A,
				currency: "INR",
			});
			return { header, panel };
		});
		await waitFor(() => expect(result.current.panel.isSuccess).toBe(true));
		expect(seen).toHaveLength(1);
		expect(result.current.header.data).toBe(result.current.panel.data);
	});

	test("another caller can ask without breakdowns", async () => {
		const seen = route(network, "get", "/api/transactions/summary", () =>
			ok(CHECK_A_SUMMARY),
		);
		const { result } = renderHookInApp(() =>
			useTransactionSummary({ filter: {}, currency: "INR", by: [] }),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen[0]?.path).toBe("/api/transactions/summary");
	});

	test("a failed summary is the query's error, for 'Totals could not be loaded.'", async () => {
		route(network, "get", "/api/transactions/summary", () =>
			refuse(500, "internal", { message: "This could not be loaded." }),
		);
		const { result } = renderHookInApp(() =>
			useTransactionSummary({ filter: {}, currency: "INR" }),
		);
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({ status: 500 });
	});
});
