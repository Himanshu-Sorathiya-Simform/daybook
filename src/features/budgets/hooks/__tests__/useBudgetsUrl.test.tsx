import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useBudgetsUrl } from "../useBudgetsUrl";
import { urlHarness } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const CURRENT = "2026-11";

/** Renders the hook at `search`, then lets the URL cleanup, which waits a microtask for Next's
 * router, run. */
async function renderUrl(
	search: string,
	options?: { lag?: boolean; late?: boolean },
) {
	const { calls, Url, flush } = urlHarness(search, "/budgets", options);
	const view = renderHook(() => useBudgetsUrl(CURRENT), { wrapper: Url });
	await act(async () => {});
	return { ...view, calls, flush };
}

describe("reading the URL (BR-F04-14)", () => {
	test("no month is the current month", async () => {
		const { result, calls } = await renderUrl("");
		expect(result.current.month).toBe(CURRENT);
		expect(result.current.notice).toBe(false);
		expect(calls).toEqual([]);
	});

	test("a month link shows that month, as from the dashboard's widget", async () => {
		const { result, calls } = await renderUrl("?month=2026-10");
		expect(result.current.month).toBe("2026-10");
		expect(result.current.notice).toBe(false);
		expect(calls).toEqual([]);
	});

	test("a link naming the current month is kept as it is", async () => {
		const { result, calls } = await renderUrl("?month=2026-11");
		expect(result.current.month).toBe(CURRENT);
		expect(calls).toEqual([]);
	});
});

describe("an invalid month (FIL-5, D-566)", () => {
	test.each(["?month=2023-10", "?month=2027-12", "?month=2026-13", "?month=oct"])(
		"%s is dropped with the notice, by replacing the URL",
		async (search) => {
			const { result, calls } = await renderUrl(search);
			expect(result.current.month).toBe(CURRENT);
			expect(result.current.notice).toBe(true);
			expect(calls).toEqual([{ mode: "replace", href: "/budgets" }]);
		},
	);

	test("the notice stays once the URL is clean, until dismissed", async () => {
		const { result } = await renderUrl("?month=2030-01");
		expect(result.current.notice).toBe(true);
		act(() => result.current.dismissNotice());
		expect(result.current.notice).toBe(false);
	});

	test("changing the month drops the notice", async () => {
		const { result } = await renderUrl("?month=2030-01");
		act(() => result.current.setMonth("2026-10"));
		expect(result.current.notice).toBe(false);
	});

	test("the cleanup waits for Next's router, which listens only after its own effect", async () => {
		const { calls } = await renderUrl("?month=bad", { late: true });
		expect(calls).toEqual([{ mode: "replace", href: "/budgets" }]);
	});

	test("an unmount before the router listens cancels the cleanup", () => {
		const { calls, Url } = urlHarness("?month=bad");
		const { unmount } = renderHook(() => useBudgetsUrl(CURRENT), {
			wrapper: Url,
		});
		unmount();
		return Promise.resolve().then(() => expect(calls).toEqual([]));
	});
});

describe("changing the month", () => {
	test("pushes a history entry naming the month", async () => {
		const { result, calls } = await renderUrl("");
		act(() => result.current.setMonth("2026-10"));
		expect(calls).toEqual([{ mode: "push", href: "/budgets?month=2026-10" }]);
		expect(result.current.month).toBe("2026-10");
	});

	test("the current month is written as the page with no month", async () => {
		const { result, calls } = await renderUrl("?month=2026-10");
		act(() => result.current.setMonth(CURRENT));
		expect(calls).toEqual([{ mode: "push", href: "/budgets" }]);
		expect(result.current.month).toBe(CURRENT);
	});

	test("choosing the month already shown adds no history entry", async () => {
		const { result, calls } = await renderUrl("?month=2026-10");
		act(() => result.current.setMonth("2026-10"));
		expect(calls).toEqual([]);
		const current = await renderUrl("");
		act(() => current.result.current.setMonth("2026-11"));
		expect(current.calls).toEqual([]);
	});

	test("choosing the month already shown still drops the notice", async () => {
		const { result } = await renderUrl("?month=bad");
		act(() => result.current.setMonth("2026-11"));
		expect(result.current.notice).toBe(false);
	});

	test("each change is its own entry, so Back goes through them", async () => {
		const { result, calls } = await renderUrl("");
		act(() => result.current.setMonth("2026-10"));
		act(() => result.current.setMonth("2026-09"));
		expect(calls.map((call) => call.mode)).toEqual(["push", "push"]);
		expect(result.current.month).toBe("2026-09");
	});

	test("other parameters in the link do not survive a change", async () => {
		const { result, calls } = await renderUrl("?month=2026-10&utm_source=mail");
		act(() => result.current.setMonth("2026-09"));
		expect(calls).toEqual([{ mode: "push", href: "/budgets?month=2026-09" }]);
	});

	test("the month follows the router, which may take the change a render later", async () => {
		const { result, flush } = await renderUrl("", { lag: true });
		act(() => result.current.setMonth("2026-10"));
		expect(result.current.month).toBe(CURRENT);
		act(() => flush());
		expect(result.current.month).toBe("2026-10");
	});
});
