import { describe, expect, test } from "vitest";

import {
	canAddView,
	clampChangedAt,
	copyOfOverview,
	defaultWidgets,
	isOverview,
	MAX_OWN_VIEWS,
	normalizeWidgets,
	OVERVIEW_ID,
	overviewView,
	type RawWidgetEntry,
	VIEW_FORMAT_VERSION,
} from "../views";
import { WIDGETS } from "../widgets";
import { NINE, TEN, VIEW_ID } from "./golden";

const raw = (id: string, size = 3, hidden = false): RawWidgetEntry => ({
	id,
	size,
	hidden,
});
const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);
const REGISTRY = WIDGETS.map((widget) => widget.id);

describe("Overview and the default widgets (BR-F08-21)", () => {
	test("are the registry in its order at default sizes, all visible", () => {
		expect(defaultWidgets()).toEqual([
			{ id: "recent", size: 3, hidden: false },
			{ id: "budgets", size: 3, hidden: false },
			{ id: "categories", size: 3, hidden: false },
			{ id: "incomeExpenses", size: 3, hidden: false },
			{ id: "goals", size: 2, hidden: false },
			{ id: "upcoming", size: 2, hidden: false },
			{ id: "investments", size: 2, hidden: false },
			{ id: "heatmap", size: 3, hidden: false },
		]);
	});

	test("are fresh objects each time, so a change never reaches the next call", () => {
		const first = defaultWidgets();
		(first[0] as { hidden: boolean }).hidden = true;
		expect(defaultWidgets()[0]?.hidden).toBe(false);
	});

	test("Overview is named and carries the default widgets, without a change time", () => {
		expect(overviewView()).toEqual({
			id: "overview",
			name: "Overview",
			widgets: defaultWidgets(),
		});
	});

	test("only `overview` is Overview's id", () => {
		expect(isOverview(OVERVIEW_ID)).toBe(true);
		expect(isOverview("Overview")).toBe(false);
		expect(isOverview(VIEW_ID)).toBe(false);
		expect(isOverview("")).toBe(false);
	});

	test("Customize's copy is named My view and holds the default widgets", () => {
		expect(copyOfOverview(VIEW_ID, NINE)).toEqual({
			id: VIEW_ID,
			name: "My view",
			widgets: defaultWidgets(),
			changedAt: NINE,
		});
	});
});

describe("canAddView (D-635)", () => {
	test.each([
		[0, true],
		[4, true],
		[5, false],
		[6, false],
	])("with %i own views it answers %s", (count, answer) => {
		expect(canAddView(count)).toBe(answer);
	});

	test("the limit is 5", () => {
		expect(MAX_OWN_VIEWS).toBe(5);
	});
});

// AC-F08-04
describe("normalizeWidgets (BR-F08-20)", () => {
	test("leaves a valid view alone", () => {
		const view = defaultWidgets();
		expect(normalizeWidgets(view)).toEqual(view);
	});

	test("drops an unknown id", () => {
		const result = normalizeWidgets([...defaultWidgets(), raw("nothing")]);
		expect(ids(result)).toEqual(REGISTRY);
	});

	test("drops ids that only look like widgets", () => {
		const result = normalizeWidgets([
			raw("Budgets"),
			raw("constructor"),
			raw("__proto__"),
			raw(""),
			...defaultWidgets(),
		]);
		expect(ids(result)).toEqual(REGISTRY);
	});

	test("appends a missing widget visible, at its default size, at the end", () => {
		const result = normalizeWidgets([raw("goals", 4, true), raw("recent", 6)]);
		expect(ids(result)).toEqual([
			"goals",
			"recent",
			"budgets",
			"categories",
			"incomeExpenses",
			"upcoming",
			"investments",
			"heatmap",
		]);
		expect(result.find((entry) => entry.id === "budgets")).toEqual({
			id: "budgets",
			size: 3,
			hidden: false,
		});
		expect(result.find((entry) => entry.id === "upcoming")).toEqual({
			id: "upcoming",
			size: 2,
			hidden: false,
		});
	});

	test("appends several missing widgets in registry order", () => {
		const result = normalizeWidgets([raw("heatmap"), raw("goals")]);
		expect(ids(result)).toEqual([
			"heatmap",
			"goals",
			"recent",
			"budgets",
			"categories",
			"incomeExpenses",
			"upcoming",
			"investments",
		]);
	});

	test("keeps the first of a duplicate, with its own size and hidden flag", () => {
		const result = normalizeWidgets([
			raw("budgets", 4, true),
			raw("budgets", 2, false),
			...defaultWidgets().filter((entry) => entry.id !== "budgets"),
		]);
		expect(result.filter((entry) => entry.id === "budgets")).toEqual([
			{ id: "budgets", size: 4, hidden: true },
		]);
	});

	test.each([5, 0, 1, 7, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
		"resets the size %j to the widget's default",
		(size) => {
			const result = normalizeWidgets([
				raw("goals", size),
				raw("recent", size),
			]);
			expect(result.find((entry) => entry.id === "goals")?.size).toBe(2);
			expect(result.find((entry) => entry.id === "recent")?.size).toBe(3);
		},
	);

	test.each([2, 3, 4, 6])("keeps the size %i", (size) => {
		expect(normalizeWidgets([raw("goals", size)])[0]?.size).toBe(size);
	});

	test("resets a size that is not a number, as a stored row could hold", () => {
		const bad = [
			{ id: "goals", size: "4", hidden: false },
		] as unknown as RawWidgetEntry[];
		expect(normalizeWidgets(bad)[0]?.size).toBe(2);
	});

	test("keeps hidden flags, and treats anything but true as visible", () => {
		const result = normalizeWidgets([
			raw("recent", 3, true),
			{ id: "budgets", size: 3, hidden: "yes" } as unknown as RawWidgetEntry,
			{ id: "goals", size: 2, hidden: undefined } as unknown as RawWidgetEntry,
		]);
		expect(result.find((e) => e.id === "recent")?.hidden).toBe(true);
		expect(result.find((e) => e.id === "budgets")?.hidden).toBe(false);
		expect(result.find((e) => e.id === "goals")?.hidden).toBe(false);
	});

	test("makes the first widget visible when every one is hidden", () => {
		const hidden = defaultWidgets().map((entry) => ({ ...entry, hidden: true }));
		const result = normalizeWidgets(hidden);
		expect(result[0]).toEqual({ id: "recent", size: 3, hidden: false });
		expect(result.slice(1).every((entry) => entry.hidden)).toBe(true);
	});

	test("makes the first of the view's own order visible, not the registry's", () => {
		const result = normalizeWidgets([
			raw("goals", 2, true),
			raw("recent", 3, true),
			...defaultWidgets()
				.filter((entry) => entry.id !== "goals" && entry.id !== "recent")
				.map((entry) => ({ ...entry, hidden: true })),
		]);
		expect(result[0]).toEqual({ id: "goals", size: 2, hidden: false });
		expect(result.filter((entry) => !entry.hidden)).toHaveLength(1);
	});

	test("hides nothing when only a missing widget is appended after hidden ones", () => {
		const result = normalizeWidgets([raw("goals", 2, true)]);
		expect(result.filter((entry) => !entry.hidden)).toHaveLength(
			REGISTRY.length - 1,
		);
		expect(result[0]?.hidden).toBe(true);
	});

	test("an empty list becomes the default widgets", () => {
		expect(normalizeWidgets([])).toEqual(defaultWidgets());
	});

	test.each([2, 0, -1, 1.5, 99])(
		"formatVersion %j gives Overview's widgets",
		(version) => {
			const custom = [
				raw("goals", 6, true),
				raw("recent", 2),
				raw("budgets", 4),
			];
			expect(normalizeWidgets(custom, version)).toEqual(defaultWidgets());
		},
	);

	test("formatVersion 1 is the current one and keeps the view", () => {
		expect(VIEW_FORMAT_VERSION).toBe(1);
		const custom = [raw("goals", 6, true), raw("recent", 2)];
		expect(normalizeWidgets(custom, 1)[0]).toEqual({
			id: "goals",
			size: 6,
			hidden: true,
		});
	});

	test("defaults to the current format", () => {
		expect(normalizeWidgets([raw("goals", 6)])[0]?.size).toBe(6);
	});

	test("never changes its input", () => {
		const input = [raw("goals", 5, true), raw("goals"), raw("nothing")];
		const copy = structuredClone(input);
		normalizeWidgets(input);
		expect(input).toEqual(copy);
	});

	test("is its own fixed point", () => {
		const once = normalizeWidgets([
			raw("heatmap", 4, true),
			raw("x"),
			raw("goals", 5),
		]);
		expect(normalizeWidgets(once)).toEqual(once);
	});
});

describe("clampChangedAt (BR-F08-22)", () => {
	const NOW = "2026-11-02T06:30:00Z";

	test("keeps an instant in the past", () => {
		expect(clampChangedAt(NINE, NOW)).toBe(NINE);
	});

	test("keeps an instant equal to now", () => {
		expect(clampChangedAt(NOW, NOW)).toBe(NOW);
	});

	test("stores an instant an hour ahead as now", () => {
		expect(clampChangedAt("2026-11-02T07:30:00Z", NOW)).toBe(NOW);
	});

	test("stores an instant a millisecond ahead as now", () => {
		expect(clampChangedAt("2026-11-02T06:30:00.001Z", NOW)).toBe(NOW);
	});

	test("compares instants as times, whatever their spelling", () => {
		expect(clampChangedAt("2026-11-02T06:30:00.000Z", NOW)).toBe(
			"2026-11-02T06:30:00.000Z",
		);
		expect(clampChangedAt(TEN, NOW)).toBe(TEN);
	});
});
