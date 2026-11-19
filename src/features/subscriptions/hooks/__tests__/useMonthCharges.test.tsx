import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { subscriptionKeys } from "../../lib/keys";
import { charge, listPage } from "../../lib/__tests__/fixtures";
import { useMonthCharges } from "../useMonthCharges";
import { ok, refuse, renderHookInApp, route, url } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

describe("useMonthCharges (BR-F05-38, BR-F05-48)", () => {
	test("reads the month's charges and caches them under it", async () => {
		const rows = [charge({ occurredOn: "2026-10-05" })];
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage(rows)),
		);
		const { result, queryClient } = renderHookInApp(() =>
			useMonthCharges("2026-10"),
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual(rows);
		expect(seen[0]?.path).toBe(
			"/api/transactions?from=2026-10-01&to=2026-10-31&src=subscription&group=none&limit=100",
		);
		expect(
			queryClient.getQueryData(subscriptionKeys.monthCharges("2026-10")),
		).toEqual(rows);
	});

	// AC-F05-33: 130 charges are two pages, all shown.
	test("walks every page, so a month of 130 charges is whole", async () => {
		const first = Array.from({ length: 100 }, () => charge());
		const second = Array.from({ length: 30 }, () => charge());
		const seen = route(network, "get", "/api/transactions", (_request, index) =>
			ok(index === 0 ? listPage(first, "page-2") : listPage(second)),
		);
		const { result } = renderHookInApp(() => useMonthCharges("2026-11"));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toHaveLength(130);
		expect(seen).toHaveLength(2);
		expect(seen[1]?.path).toContain("&cursor=page-2");
	});

	test("choosing another month reads that month", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([])),
		);
		const { result, rerender } = renderHookInApp(
			(month: string) => useMonthCharges(month),
			{
				initialProps: "2026-10",
			},
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		rerender("2026-12");
		await waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[1]?.path).toContain("from=2026-12-01&to=2026-12-31");
	});

	// AC-F05-33: a failing second page shows the read's error, never part of the set.
	test("a failing second page is an error with no data", async () => {
		let calls = 0;
		network.use(
			http.get(url("/api/transactions"), () => {
				calls += 1;
				return calls === 1 ?
						ok(listPage([charge()], "page-2"))
					:	HttpResponse.json(
							{
								error: {
									code: "internal",
									message: "m",
									requestId: "r",
								},
							},
							{ status: 500 },
						);
			}),
		);
		const { result } = renderHookInApp(() => useMonthCharges("2026-11"));
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});

	test("a 403 profile_required is an error for the app to answer", async () => {
		route(network, "get", "/api/transactions", () =>
			refuse(403, "profile_required"),
		);
		const { result } = renderHookInApp(() => useMonthCharges("2026-11"));
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({ code: "profile_required" });
	});
});
