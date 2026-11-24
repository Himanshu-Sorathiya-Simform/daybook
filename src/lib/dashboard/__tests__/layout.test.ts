import { describe, expect, test } from "vitest";

import { packRows, shownWidgets } from "../layout";
import { defaultWidgets, type WidgetEntry } from "../views";
import type { WidgetSize } from "../widgets";

const entry = (
	id: WidgetEntry["id"],
	size: WidgetSize,
	hidden = false,
): WidgetEntry => ({ id, size, hidden });

describe("packRows at six columns (F08 section 3)", () => {
	test("packs Overview as F08 section 15 draws it", () => {
		const rows = packRows(defaultWidgets(), 6);
		expect(
			rows.map((row) => row.widgets.map((widget) => [widget.id, widget.span])),
		).toEqual([
			[
				["recent", 3],
				["budgets", 3],
			],
			[
				["categories", 3],
				["incomeExpenses", 3],
			],
			[
				["goals", 2],
				["upcoming", 2],
				["investments", 2],
			],
			[["heatmap", 6]],
		]);
	});

	test("makes a row as tall as its tallest widget", () => {
		expect(packRows(defaultWidgets(), 6).map((row) => row.height)).toEqual([
			580, 380, 330, 360,
		]);
	});

	test("stretches only a row's last widget, and says so", () => {
		const rows = packRows(defaultWidgets(), 6);
		expect(rows[3]?.widgets[0]).toMatchObject({
			size: 3,
			span: 6,
			stretched: true,
		});
		expect(
			rows.flatMap((row) => row.widgets).filter((widget) => widget.stretched),
		).toHaveLength(1);
	});

	test("a full row stretches nothing", () => {
		const rows = packRows([entry("recent", 3), entry("budgets", 3)], 6);
		expect(rows[0]?.widgets.map((widget) => widget.stretched)).toEqual([
			false,
			false,
		]);
	});

	test("starts a new row when the next widget does not fit", () => {
		const rows = packRows(
			[entry("goals", 4), entry("upcoming", 4), entry("recent", 2)],
			6,
		);
		expect(rows.map((row) => row.widgets.map((widget) => widget.id))).toEqual([
			["goals"],
			["upcoming", "recent"],
		]);
		expect(rows[0]?.widgets[0]).toMatchObject({
			size: 4,
			span: 6,
			stretched: true,
		});
		expect(rows[1]?.widgets.map((widget) => widget.span)).toEqual([4, 2]);
	});

	test("puts a two thirds and a third side by side", () => {
		const rows = packRows([entry("budgets", 4), entry("goals", 2)], 6);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.widgets.map((widget) => widget.span)).toEqual([4, 2]);
	});

	test("a full width widget takes a row of its own", () => {
		const rows = packRows(
			[entry("goals", 2), entry("recent", 6), entry("upcoming", 2)],
			6,
		);
		expect(rows.map((row) => row.widgets.map((widget) => widget.id))).toEqual([
			["goals"],
			["recent"],
			["upcoming"],
		]);
		expect(rows[1]?.widgets[0]).toMatchObject({ span: 6, stretched: false });
	});

	test("keeps each widget's own size beside its span", () => {
		const rows = packRows([entry("goals", 2)], 6);
		expect(rows[0]?.widgets[0]).toEqual({
			id: "goals",
			size: 2,
			span: 6,
			stretched: true,
		});
	});

	test("makes no rows from no widgets", () => {
		expect(packRows([], 6)).toEqual([]);
		expect(packRows([], 1)).toEqual([]);
	});

	test("never changes its input", () => {
		const input = defaultWidgets();
		const copy = structuredClone(input);
		packRows(input, 6);
		expect(input).toEqual(copy);
	});
});

describe("packRows in one column", () => {
	test("gives every widget a row of its own, full width, with nothing stretched", () => {
		const rows = packRows(defaultWidgets(), 1);
		expect(rows).toHaveLength(8);
		for (const row of rows) {
			expect(row.widgets).toHaveLength(1);
			expect(row.widgets[0]).toMatchObject({ span: 1, stretched: false });
		}
	});

	test("reserves each widget's own height", () => {
		expect(packRows(defaultWidgets(), 1).map((row) => row.height)).toEqual([
			580, 580, 380, 380, 330, 330, 300, 360,
		]);
	});
});

describe("shownWidgets (BR-F08-19)", () => {
	test("shows the visible widgets in order", () => {
		const widgets = defaultWidgets();
		(widgets[1] as WidgetEntry).hidden = true;
		expect(shownWidgets(widgets, false).map((widget) => widget.id)).toEqual([
			"recent",
			"categories",
			"incomeExpenses",
			"goals",
			"upcoming",
			"investments",
			"heatmap",
		]);
	});

	test("keeps only Investments while the account is empty", () => {
		expect(
			shownWidgets(defaultWidgets(), true).map((widget) => widget.id),
		).toEqual(["investments"]);
	});

	test("shows nothing while the account is empty and Investments is hidden", () => {
		const widgets = defaultWidgets().map((widget) => ({
			...widget,
			hidden: widget.id === "investments",
		}));
		expect(shownWidgets(widgets, true)).toEqual([]);
	});

	test("keeps a widget's size", () => {
		const widgets = [entry("investments", 6)];
		expect(shownWidgets(widgets, true)).toEqual([entry("investments", 6)]);
	});
});
