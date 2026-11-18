import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { resetUnsavedView, useBudgetsView, VIEW_KEY } from "../useBudgetsView";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
	vi.restoreAllMocks();
	resetUnsavedView();
	window.localStorage.clear();
});

describe("useBudgetsView (BR-F04-14)", () => {
	test("is List by default", () => {
		const { result } = renderHook(() => useBudgetsView());
		expect(result.current[0]).toBe("list");
	});

	test("the key is daybook.budgets.view", () => {
		expect(VIEW_KEY).toBe("daybook.budgets.view");
	});

	test("reads a Table stored on the device", () => {
		window.localStorage.setItem(VIEW_KEY, "table");
		const { result } = renderHook(() => useBudgetsView());
		expect(result.current[0]).toBe("table");
	});

	test.each(["TABLE", "grid", "", "null", '"table"'])(
		"anything else stored, here %j, is List",
		(stored) => {
			window.localStorage.setItem(VIEW_KEY, stored);
			const { result } = renderHook(() => useBudgetsView());
			expect(result.current[0]).toBe("list");
		},
	);

	test("a choice shows at once and is stored for the next visit", () => {
		const { result } = renderHook(() => useBudgetsView());
		act(() => result.current[1]("table"));
		expect(result.current[0]).toBe("table");
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("table");
		act(() => result.current[1]("list"));
		expect(result.current[0]).toBe("list");
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("list");
	});

	test("every page using it in the tab follows a choice", () => {
		const first = renderHook(() => useBudgetsView());
		const second = renderHook(() => useBudgetsView());
		act(() => first.result.current[1]("table"));
		expect(second.result.current[0]).toBe("table");
	});

	test("follows a choice made in another tab", () => {
		const { result } = renderHook(() => useBudgetsView());
		act(() => {
			window.localStorage.setItem(VIEW_KEY, "table");
			window.dispatchEvent(new StorageEvent("storage", { key: VIEW_KEY }));
		});
		expect(result.current[0]).toBe("table");
	});

	test("follows another tab clearing storage", () => {
		window.localStorage.setItem(VIEW_KEY, "table");
		const { result } = renderHook(() => useBudgetsView());
		act(() => {
			window.localStorage.clear();
			window.dispatchEvent(new StorageEvent("storage", { key: null }));
		});
		expect(result.current[0]).toBe("list");
	});

	test("ignores other keys changing in another tab", () => {
		const { result } = renderHook(() => useBudgetsView());
		const before = result.current;
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", { key: "daybook.other" }),
			);
		});
		expect(result.current[0]).toBe("list");
		expect(result.current[0]).toBe(before[0]);
	});

	test("storage that cannot be read leaves the page on List", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("denied", "SecurityError");
		});
		const { result } = renderHook(() => useBudgetsView());
		expect(result.current[0]).toBe("list");
	});

	test("storage that refuses a write still switches the view, for this tab until it reloads", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		const { result } = renderHook(() => useBudgetsView());
		act(() => result.current[1]("table"));
		expect(result.current[0]).toBe("table");
		expect(window.localStorage.getItem(VIEW_KEY)).toBeNull();
	});

	test("once storage takes writes again, the next choice is stored", () => {
		const setItem = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementationOnce(() => {
				throw new DOMException("full", "QuotaExceededError");
			});
		const { result } = renderHook(() => useBudgetsView());
		act(() => result.current[1]("table"));
		setItem.mockRestore();
		act(() => result.current[1]("list"));
		expect(result.current[0]).toBe("list");
		expect(window.localStorage.getItem(VIEW_KEY)).toBe("list");
	});

	test("the server renders List, whatever the device stored", () => {
		window.localStorage.setItem(VIEW_KEY, "table");
		function Probe() {
			return <span>{useBudgetsView()[0]}</span>;
		}
		expect(renderToString(<Probe />)).toContain("list");
	});
});
