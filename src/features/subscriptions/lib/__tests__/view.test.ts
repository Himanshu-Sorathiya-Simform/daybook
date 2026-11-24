import { describe, expect, test } from "vitest";

import {
	pageShape,
	shownView,
	SUBSCRIPTION_VIEWS,
	VIEW_COOKIE,
	VIEW_KEY,
} from "../view";

describe("the view switch (BR-F05-21)", () => {
	test("the key is daybook.subscriptions.view", () => {
		expect(VIEW_KEY).toBe("daybook.subscriptions.view");
	});

	// D-629: the cookie is kept at logout, which clears every cookie named daybook.…
	test("the cookie is daybook_view_subscriptions, outside the session cookies' prefix", () => {
		expect(VIEW_COOKIE).toBe("daybook_view_subscriptions");
		expect(VIEW_COOKIE.startsWith("daybook.")).toBe(false);
	});

	test("the views are List, Calendar and Table, List first", () => {
		expect(SUBSCRIPTION_VIEWS).toEqual(["list", "calendar", "table"]);
	});

	test.each([
		["list", true, "list"],
		["calendar", true, "calendar"],
		["table", true, "table"],
		["list", false, "list"],
		["calendar", false, "calendar"],
		["table", false, "list"],
	] as const)("stored %s at wide=%s shows %s", (stored, wide, shown) => {
		expect(shownView(stored, wide)).toBe(shown);
	});
});

describe("what the page has to show", () => {
	const some = { items: [1] };

	test("while loading, with no failure, there is nothing to show yet", () => {
		expect(pageShape(undefined, false)).toEqual({
			failed: false,
			isEmpty: false,
			showPanel: false,
		});
	});

	test("a load that failed with nothing saved is a failure, with no panel", () => {
		expect(pageShape(undefined, true)).toEqual({
			failed: true,
			isEmpty: false,
			showPanel: false,
		});
	});

	test("a list with no Subscription is empty, with no panel", () => {
		expect(pageShape({ items: [] }, false)).toEqual({
			failed: false,
			isEmpty: true,
			showPanel: false,
		});
	});

	test("a list with Subscriptions shows the panel", () => {
		expect(pageShape(some, false)).toEqual({
			failed: false,
			isEmpty: false,
			showPanel: true,
		});
	});

	test("a failed refetch with a list saved is not a failure", () => {
		expect(pageShape(some, true).failed).toBe(false);
		expect(pageShape({ items: [] }, true).failed).toBe(false);
	});
});
