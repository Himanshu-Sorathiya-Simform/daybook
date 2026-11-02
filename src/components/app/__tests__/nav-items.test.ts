import { describe, expect, test } from "vitest";

import {
	BOTTOM_BAR_ITEMS,
	isCurrent,
	MORE_ITEMS,
	SETTINGS_ITEM,
	SIDEBAR_ITEMS,
} from "../nav-items";

const labels = (items: readonly { label: string }[]) =>
	items.map((item) => item.label);

describe("the navigation's items (root section 4)", () => {
	test("the sidebar lists the root spec's order, then Settings", () => {
		expect([...labels(SIDEBAR_ITEMS), SETTINGS_ITEM.label]).toEqual([
			"Dashboard",
			"Transactions",
			"Budgets",
			"Subscriptions",
			"Goals",
			"Investments",
			"Analytics",
			"Insights",
			"Reports",
			"Learn",
			"Settings",
		]);
	});

	test("each item opens its route from the route table", () => {
		expect(
			Object.fromEntries(
				[...SIDEBAR_ITEMS, SETTINGS_ITEM].map((item) => [
					item.label,
					item.href,
				]),
			),
		).toEqual({
			Dashboard: "/dashboard",
			Transactions: "/transactions",
			Budgets: "/budgets",
			Subscriptions: "/subscriptions",
			Goals: "/goals",
			Investments: "/investments",
			Analytics: "/analytics",
			Insights: "/insights",
			Reports: "/reports",
			Learn: "/learn",
			Settings: "/settings",
		});
	});

	test("groups start at Goals, Analytics and Learn, as the design draws them", () => {
		expect(labels(SIDEBAR_ITEMS.filter((item) => item.groupStart))).toEqual([
			"Goals",
			"Analytics",
			"Learn",
		]);
	});

	test("every item has its own icon", () => {
		const icons = [...SIDEBAR_ITEMS, SETTINGS_ITEM].map((item) => item.icon);
		expect(icons.every(Boolean)).toBe(true);
		expect(new Set(icons).size).toBe(icons.length);
	});

	// D-504: Add joins the bottom bar with F03's interface.
	test("the bottom bar holds Dashboard, Transactions and Budgets, without Add yet", () => {
		expect(labels(BOTTOM_BAR_ITEMS)).toEqual([
			"Dashboard",
			"Transactions",
			"Budgets",
		]);
	});

	test("More holds the rest in the sidebar's order, Settings last", () => {
		expect(labels(MORE_ITEMS)).toEqual([
			"Subscriptions",
			"Goals",
			"Investments",
			"Analytics",
			"Insights",
			"Reports",
			"Learn",
			"Settings",
		]);
	});

	test("on a phone every destination is reachable exactly once", () => {
		const phone = [...BOTTOM_BAR_ITEMS, ...MORE_ITEMS].map((item) => item.href);
		const desktop = [...SIDEBAR_ITEMS, SETTINGS_ITEM].map((item) => item.href);
		expect(new Set(phone).size).toBe(phone.length);
		expect([...phone].sort()).toEqual([...desktop].sort());
	});
});

describe("isCurrent", () => {
	test.each([
		["/budgets", "/budgets", true],
		["/goals/0192f0c4-8a1b-7c2d-9e3f-0123456789ab", "/goals", true],
		["/settings/profile", "/settings", true],
		["/settings", "/settings", true],
		["/goalsx", "/goals", false],
		["/goals-old", "/goals", false],
		["/", "/dashboard", false],
		["/transactions", "/dashboard", false],
		["/learn", "/learners", false],
		["/budget", "/budgets", false],
		["/Budgets", "/budgets", false],
		["", "/budgets", false],
	])("%j is %j: %s", (pathname, href, expected) => {
		expect(isCurrent(pathname, href)).toBe(expected);
	});
});
