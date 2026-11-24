import { afterEach, describe, expect, test, vi } from "vitest";

import {
	choiceOf,
	DEVICE_COOKIE_MAX_AGE,
	isWideValue,
	WIDE_COOKIE,
	wideValue,
	writeDeviceCookie,
} from "../device-cookies";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.cookie = "daybook_test=; Max-Age=0; Path=/";
});

describe("the device cookies (D-629)", () => {
	test("last a year, as the sidebar's does", () => {
		expect(DEVICE_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60);
	});

	test("the window class cookie is daybook_wide", () => {
		expect(WIDE_COOKIE).toBe("daybook_wide");
	});

	test.each([
		[true, "wide"],
		[false, "narrow"],
	])("a wide window of %s is written %s", (wide, value) => {
		expect(wideValue(wide)).toBe(value);
	});

	test.each([
		["wide", true],
		["narrow", false],
		[undefined, false],
		["", false],
		["Wide", false],
		["wide ", false],
		["1", false],
	])("%j says the window was wide: %s", (value, expected) => {
		expect(isWideValue(value)).toBe(expected);
	});
});

describe("choiceOf", () => {
	const VIEWS = ["list", "calendar", "table"] as const;

	test.each(VIEWS)("names %s when it is allowed", (value) => {
		expect(choiceOf(value, VIEWS, "list")).toBe(value);
	});

	test.each([undefined, null, "", "grid", "TABLE", " table", "table "])(
		"%j is the fallback",
		(value) => {
			expect(choiceOf(value, VIEWS, "calendar")).toBe("calendar");
		},
	);

	test("an inherited property name is the fallback, not a choice", () => {
		expect(choiceOf("valueOf", VIEWS, "list")).toBe("list");
		expect(choiceOf("__proto__", VIEWS, "list")).toBe("list");
	});
});

describe("writeDeviceCookie", () => {
	test("keeps a value for a year, on every path, for same-site requests", () => {
		const set = vi.spyOn(document, "cookie", "set");
		writeDeviceCookie("daybook_test", "calendar");
		expect(set).toHaveBeenCalledExactlyOnceWith(
			`daybook_test=calendar; Max-Age=${DEVICE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`,
		);
	});

	test("is Secure when the page is served over https", () => {
		vi.stubGlobal("location", { ...window.location, protocol: "https:" });
		const set = vi.spyOn(document, "cookie", "set");
		writeDeviceCookie("daybook_test", "wide");
		expect(set.mock.calls[0]![0]).toMatch(/; Secure$/);
	});

	test("is not Secure over http, where the browser would drop it", () => {
		vi.stubGlobal("location", { ...window.location, protocol: "http:" });
		const set = vi.spyOn(document, "cookie", "set");
		writeDeviceCookie("daybook_test", "wide");
		expect(set.mock.calls[0]![0]).not.toMatch(/Secure/);
	});

	test("the browser keeps it for the next read", () => {
		writeDeviceCookie("daybook_test", "table");
		expect(document.cookie).toContain("daybook_test=table");
	});

	test("a later write replaces the value", () => {
		writeDeviceCookie("daybook_test", "table");
		writeDeviceCookie("daybook_test", "list");
		expect(document.cookie).toContain("daybook_test=list");
		expect(document.cookie).not.toContain("daybook_test=table");
	});
});
