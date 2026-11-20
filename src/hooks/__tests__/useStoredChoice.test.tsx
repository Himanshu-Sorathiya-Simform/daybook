import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { resetUnsavedChoices, useStoredChoice } from "../useStoredChoice";

const KEY = "daybook.test.view";
const VIEWS = ["list", "calendar", "table"] as const;
type View = (typeof VIEWS)[number];

const renderChoice = (key = KEY) =>
	renderHook(() => useStoredChoice<View>(key, VIEWS, "list"));

beforeEach(() => window.localStorage.clear());
afterEach(() => {
	vi.restoreAllMocks();
	resetUnsavedChoices();
	window.localStorage.clear();
});

describe("useStoredChoice", () => {
	test("is the fallback when nothing is stored", () => {
		expect(renderChoice().result.current[0]).toBe("list");
	});

	test.each(VIEWS)("reads a stored %s", (stored) => {
		window.localStorage.setItem(KEY, stored);
		expect(renderChoice().result.current[0]).toBe(stored);
	});

	test.each(["TABLE", "grid", "", "null", '"table"', " table"])(
		"anything else stored, here %j, is the fallback",
		(stored) => {
			window.localStorage.setItem(KEY, stored);
			expect(renderChoice().result.current[0]).toBe("list");
		},
	);

	test("a fallback other than the first allowed word is used", () => {
		const { result } = renderHook(() =>
			useStoredChoice<View>(KEY, VIEWS, "calendar"),
		);
		expect(result.current[0]).toBe("calendar");
	});

	test("a choice shows at once and is stored under its key", () => {
		const { result } = renderChoice();
		act(() => result.current[1]("table"));
		expect(result.current[0]).toBe("table");
		expect(window.localStorage.getItem(KEY)).toBe("table");
		act(() => result.current[1]("list"));
		expect(result.current[0]).toBe("list");
		expect(window.localStorage.getItem(KEY)).toBe("list");
	});

	test("every use of the same key in the tab follows a choice", () => {
		const first = renderChoice();
		const second = renderChoice();
		act(() => first.result.current[1]("calendar"));
		expect(second.result.current[0]).toBe("calendar");
	});

	test("another key is not touched by a choice", () => {
		const first = renderChoice();
		const other = renderChoice("daybook.other.view");
		act(() => first.result.current[1]("table"));
		expect(other.result.current[0]).toBe("list");
		expect(window.localStorage.getItem("daybook.other.view")).toBeNull();
	});

	test("follows a choice made in another tab", () => {
		const { result } = renderChoice();
		act(() => {
			window.localStorage.setItem(KEY, "table");
			window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
		});
		expect(result.current[0]).toBe("table");
	});

	test("follows another tab clearing storage", () => {
		window.localStorage.setItem(KEY, "table");
		const { result } = renderChoice();
		act(() => {
			window.localStorage.clear();
			window.dispatchEvent(new StorageEvent("storage", { key: null }));
		});
		expect(result.current[0]).toBe("list");
	});

	test("ignores other keys changing in another tab", () => {
		const { result } = renderChoice();
		act(() => {
			window.localStorage.setItem("daybook.other.view", "table");
			window.dispatchEvent(
				new StorageEvent("storage", { key: "daybook.other.view" }),
			);
		});
		expect(result.current[0]).toBe("list");
	});

	test("stops listening when it unmounts", () => {
		const remove = vi.spyOn(window, "removeEventListener");
		const { unmount } = renderChoice();
		unmount();
		expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
	});

	test("storage that cannot be read leaves the fallback", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("denied", "SecurityError");
		});
		expect(renderChoice().result.current[0]).toBe("list");
	});

	test("storage that refuses a write still switches, for this tab until it reloads", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		const { result } = renderChoice();
		act(() => result.current[1]("table"));
		expect(result.current[0]).toBe("table");
		expect(window.localStorage.getItem(KEY)).toBeNull();
	});

	test("an unsaved choice of one key does not leak into another", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		const { result } = renderChoice();
		const other = renderChoice("daybook.other.view");
		act(() => result.current[1]("table"));
		expect(other.result.current[0]).toBe("list");
	});

	test("once storage takes writes again, the next choice is stored", () => {
		const setItem = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementationOnce(() => {
				throw new DOMException("full", "QuotaExceededError");
			});
		const { result } = renderChoice();
		act(() => result.current[1]("table"));
		setItem.mockRestore();
		act(() => result.current[1]("list"));
		expect(result.current[0]).toBe("list");
		expect(window.localStorage.getItem(KEY)).toBe("list");
	});

	test("the server renders the fallback, whatever the device stored", () => {
		window.localStorage.setItem(KEY, "table");
		function Probe() {
			return <span>{useStoredChoice<View>(KEY, VIEWS, "list")[0]}</span>;
		}
		expect(renderToString(<Probe />)).toContain("list");
	});
});
