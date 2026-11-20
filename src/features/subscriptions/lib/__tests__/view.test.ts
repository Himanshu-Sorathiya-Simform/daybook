import { describe, expect, test } from "vitest";

import { shownView, SUBSCRIPTION_VIEWS, VIEW_KEY } from "../view";

describe("the view switch (BR-F05-21)", () => {
	test("the key is daybook.subscriptions.view", () => {
		expect(VIEW_KEY).toBe("daybook.subscriptions.view");
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
