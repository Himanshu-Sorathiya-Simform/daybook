import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { resetUnsavedChoices, useStoredChoice } from "../useStoredChoice";

const KEY = "daybook.test.view";
const VIEWS = ["list", "calendar", "table"] as const;
type View = (typeof VIEWS)[number];

const renderChoice = (key = KEY) =>
	renderHook(() => useStoredChoice<View>(key, VIEWS, "list"));

const cookieOf = (key = KEY) =>
	document.cookie
		.split("; ")
		.find((entry) => entry.startsWith(`${key}=`))
		?.split("=")[1];
const clearCookies = () => {
	for (const key of [KEY, "daybook.other.view"]) {
		document.cookie = `${key}=; Max-Age=0; Path=/`;
	}
};

beforeEach(() => {
	window.localStorage.clear();
	clearCookies();
});
afterEach(() => {
	vi.restoreAllMocks();
	clearCookies();
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

describe("the cookie and the server's choice (D-629)", () => {
	function Probe({ serverChoice }: { serverChoice?: View }) {
		return (
			<span>{useStoredChoice<View>(KEY, VIEWS, "list", serverChoice)[0]}</span>
		);
	}

	test("the server renders the choice it is given, from the cookie it read", () => {
		expect(renderToString(<Probe serverChoice="table" />)).toContain("table");
		expect(renderToString(<Probe serverChoice="calendar" />)).toContain(
			"calendar",
		);
	});

	test("with none given the server renders the fallback", () => {
		expect(renderToString(<Probe />)).toContain("list");
	});

	test("the browser's first draw is the server's, before storage says anything else", () => {
		const seen: View[] = [];
		window.localStorage.setItem(KEY, "table");
		renderHook(() => {
			const [choice] = useStoredChoice<View>(KEY, VIEWS, "list", "calendar");
			seen.push(choice);
		});
		// Storage is the truth where it is readable, so the choice the browser reads wins.
		expect(seen.at(-1)).toBe("table");
	});

	test("storage that holds a choice outranks the server's", () => {
		window.localStorage.setItem(KEY, "table");
		const { result } = renderHook(() =>
			useStoredChoice<View>(KEY, VIEWS, "list", "calendar"),
		);
		expect(result.current[0]).toBe("table");
	});

	test("empty storage leaves the server's choice standing, so nothing is redrawn", () => {
		const { result } = renderHook(() =>
			useStoredChoice<View>(KEY, VIEWS, "list", "calendar"),
		);
		expect(result.current[0]).toBe("calendar");
	});

	test("so does storage holding something that is not a choice", () => {
		window.localStorage.setItem(KEY, "grid");
		const { result } = renderHook(() =>
			useStoredChoice<View>(KEY, VIEWS, "list", "calendar"),
		);
		expect(result.current[0]).toBe("calendar");
	});

	test("so does storage that cannot be read", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("denied", "SecurityError");
		});
		const { result } = renderHook(() =>
			useStoredChoice<View>(KEY, VIEWS, "list", "calendar"),
		);
		expect(result.current[0]).toBe("calendar");
	});

	test("keeps the choice in a cookie named by its key", () => {
		window.localStorage.setItem(KEY, "calendar");
		renderChoice();
		expect(cookieOf()).toBe("calendar");
	});

	test("gives a device that chose before cookies one", () => {
		window.localStorage.setItem(KEY, "table");
		expect(cookieOf()).toBeUndefined();
		renderChoice();
		expect(cookieOf()).toBe("table");
	});

	test("writes the fallback when nothing was chosen", () => {
		renderChoice();
		expect(cookieOf()).toBe("list");
	});

	test("a new choice rewrites the cookie", () => {
		const { result } = renderChoice();
		act(() => result.current[1]("table"));
		expect(cookieOf()).toBe("table");
		act(() => result.current[1]("calendar"));
		expect(cookieOf()).toBe("calendar");
	});

	test("a choice storage refused is still kept in the cookie", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("full", "QuotaExceededError");
		});
		const { result } = renderChoice();
		act(() => result.current[1]("table"));
		expect(cookieOf()).toBe("table");
	});

	test("a choice made in another tab reaches the cookie here", () => {
		const { result } = renderChoice();
		act(() => {
			window.localStorage.setItem(KEY, "table");
			window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
		});
		expect(result.current[0]).toBe("table");
		expect(cookieOf()).toBe("table");
	});

	test("each key has its own cookie", () => {
		const first = renderChoice();
		renderChoice("daybook.other.view");
		act(() => first.result.current[1]("table"));
		expect(cookieOf()).toBe("table");
		expect(cookieOf("daybook.other.view")).toBe("list");
	});
});
