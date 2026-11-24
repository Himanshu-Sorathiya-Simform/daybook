import { describe, expect, test } from "vitest";

import {
	isWidgetId,
	isWidgetSize,
	WIDGET_SIZES,
	WIDGETS,
	widgetById,
} from "../widgets";

describe("the registry (F08 section 3, D-280)", () => {
	test("has the 8 widgets of M3 in Overview's order", () => {
		expect(WIDGETS.map((widget) => widget.id)).toEqual([
			"recent",
			"budgets",
			"categories",
			"incomeExpenses",
			"goals",
			"upcoming",
			"investments",
			"heatmap",
		]);
	});

	test("leaves Insights and Latest from Learn out until their features arrive", () => {
		expect(isWidgetId("insights")).toBe(false);
		expect(isWidgetId("learn")).toBe(false);
	});

	test("gives every widget a unique id, a title and a valid default size", () => {
		const ids = WIDGETS.map((widget) => widget.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const widget of WIDGETS) {
			expect(widget.title.length).toBeGreaterThan(0);
			expect(isWidgetSize(widget.defaultSize)).toBe(true);
		}
	});

	test.each([
		["recent", "Recent Transactions", 3, 580, true],
		["budgets", "Budgets", 3, 580, true],
		["categories", "Spending by category", 3, 380, true],
		["incomeExpenses", "Income vs expenses", 3, 380, true],
		["goals", "Goals", 2, 330, true],
		["upcoming", "Coming up", 2, 330, true],
		["investments", "Investments", 2, 300, false],
		["heatmap", "Calendar heat map", 3, 360, true],
	])(
		"%s is %s, size %i, %i px, finance %s",
		(id, title, size, height, finance) => {
			expect(widgetById(id)).toMatchObject({
				title,
				defaultSize: size,
				height,
				finance,
			});
		},
	);

	test("only the heat map has a capability", () => {
		const gated = WIDGETS.filter((widget) => "capability" in widget);
		expect(gated.map((widget) => widget.id)).toEqual(["heatmap"]);
		expect(widgetById("heatmap")).toMatchObject({
			capability: "analytics.heatmap.view",
		});
	});

	test("only Investments stays when the onboarding panel hides the finance widgets", () => {
		expect(WIDGETS.filter((widget) => !widget.finance).map((w) => w.id)).toEqual(
			["investments"],
		);
	});
});

describe("sizes (D-635)", () => {
	test("are 2, 3, 4 and 6 of 6 columns", () => {
		expect(WIDGET_SIZES).toEqual([2, 3, 4, 6]);
	});

	test.each([2, 3, 4, 6])("%i is a size", (size) => {
		expect(isWidgetSize(size)).toBe(true);
	});

	test.each([0, 1, 5, 7, -2, 2.5, NaN, "4", null, undefined, true])(
		"%j is not",
		(value) => {
			expect(isWidgetSize(value)).toBe(false);
		},
	);
});

describe("lookups", () => {
	test("find a widget by id and refuse anything else", () => {
		expect(widgetById("goals")?.title).toBe("Goals");
		expect(widgetById("nothing")).toBeUndefined();
		expect(widgetById("")).toBeUndefined();
		expect(widgetById("constructor")).toBeUndefined();
	});

	test("isWidgetId accepts only registry ids", () => {
		expect(isWidgetId("budgets")).toBe(true);
		expect(isWidgetId("Budgets")).toBe(false);
		expect(isWidgetId(4)).toBe(false);
		expect(isWidgetId(null)).toBe(false);
	});
});
