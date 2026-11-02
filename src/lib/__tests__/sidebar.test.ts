import { afterEach, describe, expect, test, vi } from "vitest";

import {
	isRail,
	SIDEBAR_COOKIE,
	SIDEBAR_MAX_AGE,
	writeSidebarChoice,
} from "../sidebar";

afterEach(() => {
	vi.restoreAllMocks();
	document.cookie = `${SIDEBAR_COOKIE}=; Max-Age=0; Path=/`;
});

describe("the sidebar cookie (D-513)", () => {
	test("is daybook_sidebar and lasts a year", () => {
		expect(SIDEBAR_COOKIE).toBe("daybook_sidebar");
		expect(SIDEBAR_MAX_AGE).toBe(365 * 24 * 60 * 60);
	});

	test.each([
		["rail", true],
		["full", false],
		[undefined, false],
		["", false],
		["Rail", false],
		["rail ", false],
		["1", false],
		["true", false],
	])("%j asks for the rail: %s", (value, expected) => {
		expect(isRail(value)).toBe(expected);
	});

	test.each([
		[true, "rail"],
		[false, "full"],
	])("choosing rail=%s writes %s for a year on every path", (rail, value) => {
		const set = vi.spyOn(document, "cookie", "set");
		writeSidebarChoice(rail);
		expect(set).toHaveBeenCalledExactlyOnceWith(
			`daybook_sidebar=${value}; Max-Age=31536000; Path=/; SameSite=Lax`,
		);
	});

	test("a later choice replaces the earlier one, and the value reads back", () => {
		writeSidebarChoice(true);
		writeSidebarChoice(false);
		expect(document.cookie.match(/daybook_sidebar=/g)).toHaveLength(1);
		const value = /daybook_sidebar=([^;]*)/.exec(document.cookie)?.[1];
		expect(isRail(value)).toBe(false);
		writeSidebarChoice(true);
		expect(isRail(/daybook_sidebar=([^;]*)/.exec(document.cookie)?.[1])).toBe(
			true,
		);
	});
});
