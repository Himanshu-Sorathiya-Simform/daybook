import { act, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { useBudgetYear } from "../useBudgetYear";
import { ok, refuse, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

/** F04 section 5: 2026 is `null` to August, then 810, 1197, 38 and 0. */
const YEAR_2026 = {
	year: 2026,
	months: [
		...Array.from({ length: 8 }, (_, index) => ({
			month: `2026-0${index + 1}`,
			utilizationTenths: null,
		})),
		{ month: "2026-09", utilizationTenths: 810 },
		{ month: "2026-10", utilizationTenths: 1197 },
		{ month: "2026-11", utilizationTenths: 38 },
		{ month: "2026-12", utilizationTenths: 0 },
	],
};

describe("useBudgetYear (BR-F04-35)", () => {
	test("reads the year's twelve months", async () => {
		const seen = route(network, "get", "/api/budgets/summary", () =>
			ok(YEAR_2026),
		);
		const { result } = renderHookInApp(() => useBudgetYear(2026));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.months).toHaveLength(12);
		expect(result.current.data?.months[9]).toEqual({
			month: "2026-10",
			utilizationTenths: 1197,
		});
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets/summary?year=2026",
		]);
	});

	test("moving to another year asks for it", async () => {
		const seen = route(network, "get", "/api/budgets/summary", ({ path }) =>
			ok({ ...YEAR_2026, year: Number(path.slice(-4)) }),
		);
		const { result, rerender } = renderHookInApp(
			({ year }: { year: number }) => useBudgetYear(year),
			{ initialProps: { year: 2026 } },
		);
		await waitFor(() => expect(result.current.data?.year).toBe(2026));
		rerender({ year: 2027 });
		await waitFor(() => expect(result.current.data?.year).toBe(2027));
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets/summary?year=2026",
			"/api/budgets/summary?year=2027",
		]);
	});

	test("a year outside the range is the error (AC-F04-21)", async () => {
		route(network, "get", "/api/budgets/summary", () =>
			refuse(400, "bad_request"),
		);
		const { result } = renderHookInApp(() => useBudgetYear(2022));
		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	// F04 section 10: the year summary is not kept offline, even one read earlier in the session.
	test("offline, a year read earlier in the session reads as never read, and comes back online", async () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		const { result } = renderHookInApp(() => useBudgetYear(2026));
		await waitFor(() => expect(result.current.data).toEqual(YEAR_2026));

		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(result.current.data).toBeUndefined();
		expect(result.current.isError).toBe(false);
		expect(result.current.fetchStatus).toBe("paused");

		online.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await waitFor(() => expect(result.current.data).toEqual(YEAR_2026));
		online.mockRestore();
	});
});
