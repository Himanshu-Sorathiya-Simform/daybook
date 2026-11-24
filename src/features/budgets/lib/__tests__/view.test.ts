import { describe, expect, test } from "vitest";

import {
	BUDGET_VIEWS,
	pageShape,
	shows,
	showsNothing,
	VIEW_COOKIE,
	VIEW_KEY,
} from "../view";
import { monthAnswer } from "./fixtures";

describe("the view switch (BR-F04-14)", () => {
	test("the key is daybook.budgets.view", () => {
		expect(VIEW_KEY).toBe("daybook.budgets.view");
	});

	// D-629: the cookie is kept at logout, which clears every cookie named daybook.…
	test("the cookie is daybook_view_budgets, outside the session cookies' prefix", () => {
		expect(VIEW_COOKIE).toBe("daybook_view_budgets");
		expect(VIEW_COOKIE.startsWith("daybook.")).toBe(false);
	});

	test("the views are List and Table, List first", () => {
		expect(BUDGET_VIEWS).toEqual(["list", "table"]);
	});
});

const OCTOBER = monthAnswer("2026-10");
const NOTHING = { ...OCTOBER, budgets: [], unbudgeted: [], inactive: [] };

describe("shows and showsNothing (BR-F04-17)", () => {
	test("a category shows as a Budget, as Not budgeted or as Not active", () => {
		const row = { ...OCTOBER.budgets[0]! };
		const only = (group: "budgets" | "unbudgeted" | "inactive") => ({
			...NOTHING,
			[group]: [row],
		});
		for (const group of ["budgets", "unbudgeted", "inactive"] as const) {
			expect(shows(only(group) as never, row.category)).toBe(true);
		}
	});

	test("a category the month has no row for does not show", () => {
		expect(shows(NOTHING, "food")).toBe(false);
	});

	test("a month with no row at all shows nothing, and one with a row does not", () => {
		expect(showsNothing(NOTHING)).toBe(true);
		expect(showsNothing(OCTOBER)).toBe(false);
	});

	test("a month that has not loaded is not a new user's", () => {
		expect(showsNothing(undefined)).toBe(false);
	});
});

describe("pageShape (F04 section 6)", () => {
	const base = {
		isOnline: true,
		month: "2026-10" as const,
		current: "2026-11" as const,
		data: OCTOBER,
		loadFailed: false,
	};

	test("a loaded month shows the panel", () => {
		expect(pageShape(base)).toEqual({
			offOther: false,
			failed: false,
			isNewUser: false,
			showPanel: true,
		});
	});

	test("another month than the current one with no connection is not saved on the device", () => {
		expect(pageShape({ ...base, isOnline: false })).toMatchObject({
			offOther: true,
			showPanel: false,
		});
	});

	test("the current month with no connection is still shown", () => {
		expect(
			pageShape({ ...base, isOnline: false, month: base.current }),
		).toMatchObject({ offOther: false, showPanel: true });
	});

	test("a failed load with nothing saved is the error state", () => {
		expect(
			pageShape({ ...base, data: undefined, loadFailed: true }),
		).toMatchObject({ failed: true, showPanel: false });
	});

	test("a failed refresh with a month in hand is not a failure", () => {
		expect(pageShape({ ...base, loadFailed: true })).toMatchObject({
			failed: false,
			showPanel: true,
		});
	});

	test("a loading month shows no panel yet but is no failure", () => {
		expect(pageShape({ ...base, data: undefined })).toMatchObject({
			failed: false,
			isNewUser: false,
			showPanel: true,
		});
	});

	test("a new user's month has no panel", () => {
		expect(pageShape({ ...base, data: NOTHING })).toMatchObject({
			isNewUser: true,
			showPanel: false,
		});
	});
});
