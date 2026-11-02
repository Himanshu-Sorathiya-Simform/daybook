import { afterEach, describe, expect, test, vi } from "vitest";

import {
	clearLogoutMarker,
	hasLogoutMarker,
	LOGOUT_COOKIE,
	LOGOUT_MAX_AGE,
	signOutCountsAsDone,
	writeLogoutMarker,
} from "../logout-marker";

afterEach(() => {
	vi.restoreAllMocks();
	clearLogoutMarker();
});

describe("hasLogoutMarker (BR-F01-15)", () => {
	test("the cookie is daybook_logout", () => {
		expect(LOGOUT_COOKIE).toBe("daybook_logout");
	});

	test.each([
		["alone", "daybook_logout=1", true],
		["among others", "a=1; daybook_logout=1; b=2", true],
		["last, with no space", "a=1;daybook_logout=1", true],
		["with another value", "daybook_logout=0", false],
		["with a longer value", "daybook_logout=10", false],
		["empty", "daybook_logout=", false],
		["as part of another name", "xdaybook_logout=1", false],
		["as a prefix of another name", "daybook_logout_old=1", false],
		["no cookies", "", false],
	])("%s: %s is %s", (_name, cookies, expected) => {
		expect(hasLogoutMarker(cookies)).toBe(expected);
	});

	test("reads the page's own cookies by default", () => {
		document.cookie = "daybook_logout=1; Path=/";
		expect(hasLogoutMarker()).toBe(true);
	});
});

describe("writeLogoutMarker (BR-F01-15, D-502)", () => {
	test("lasts 8 days, longer than a 7-day session", () => {
		expect(LOGOUT_MAX_AGE).toBe(8 * 24 * 60 * 60);
	});

	// F01 section 5: `Path=/`, `SameSite=Lax`, `Max-Age=691200`.
	test("writes exactly the marker F01 names", () => {
		const set = vi.spyOn(document, "cookie", "set");
		writeLogoutMarker();
		expect(set).toHaveBeenCalledExactlyOnceWith(
			"daybook_logout=1; Max-Age=691200; Path=/; SameSite=Lax",
		);
	});

	test("the marker it writes is the one the login forms find", () => {
		writeLogoutMarker();
		expect(hasLogoutMarker()).toBe(true);
	});

	test("leaves other cookies alone", () => {
		document.cookie = "daybook_sidebar=rail; Path=/";
		writeLogoutMarker();
		expect(document.cookie).toContain("daybook_sidebar=rail");
		document.cookie = "daybook_sidebar=; Max-Age=0; Path=/";
	});

	test("writing twice keeps one marker", () => {
		writeLogoutMarker();
		writeLogoutMarker();
		expect(document.cookie.match(/daybook_logout=1/g)).toHaveLength(1);
	});
});

describe("clearLogoutMarker", () => {
	test("removes the marker and leaves other cookies", () => {
		document.cookie = "daybook_logout=1; Path=/";
		document.cookie = "other=keep; Path=/";
		clearLogoutMarker();
		expect(hasLogoutMarker()).toBe(false);
		expect(document.cookie).toContain("other=keep");
		document.cookie = "other=; Max-Age=0; Path=/";
	});

	test("is harmless without a marker", () => {
		expect(() => clearLogoutMarker()).not.toThrow();
		expect(hasLogoutMarker()).toBe(false);
	});
});

describe("signOutCountsAsDone (BR-F01-15)", () => {
	test.each([
		[200, true],
		[204, true],
		[299, true],
		[400, true],
		[401, true],
		[199, false],
		[300, false],
		[302, false],
		[403, false],
		[404, false],
		[429, false],
		[500, false],
		[503, false],
		[null, false],
	])("%s counts: %s", (status, expected) => {
		expect(signOutCountsAsDone(status)).toBe(expected);
	});
});
