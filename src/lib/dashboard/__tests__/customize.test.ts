import { describe, expect, test } from "vitest";

import {
	hideWidget,
	moveWidget,
	resetWidgets,
	setWidgetSize,
	showWidget,
} from "../customize";
import { defaultWidgets, type WidgetEntry } from "../views";
import type { WidgetSize } from "../widgets";

const ids = (widgets: WidgetEntry[]) => widgets.map((entry) => entry.id);
const view = (): WidgetEntry[] => defaultWidgets();
/** Overview with the given ids hidden. */
const hiding = (...hidden: string[]): WidgetEntry[] =>
	view().map((entry) => ({ ...entry, hidden: hidden.includes(entry.id) }));

describe("moveWidget (BR-F08-25)", () => {
	test("moves a widget earlier and says its new position", () => {
		const change = moveWidget(view(), "budgets", -1);
		expect(ids(change?.widgets ?? [])).toEqual([
			"budgets",
			"recent",
			"categories",
			"incomeExpenses",
			"goals",
			"upcoming",
			"investments",
			"heatmap",
		]);
		expect(change?.announcement).toBe("Budgets moved to position 1 of 8.");
	});

	test("moves a widget later", () => {
		const change = moveWidget(view(), "recent", 1);
		expect(ids(change?.widgets ?? []).slice(0, 2)).toEqual([
			"budgets",
			"recent",
		]);
		expect(change?.announcement).toBe(
			"Recent Transactions moved to position 2 of 8.",
		);
	});

	test("does nothing at the first place going earlier, or the last going later", () => {
		expect(moveWidget(view(), "recent", -1)).toBeNull();
		expect(moveWidget(view(), "heatmap", 1)).toBeNull();
	});

	test("does nothing for an unknown or hidden widget", () => {
		expect(moveWidget(view(), "nothing", 1)).toBeNull();
		expect(moveWidget(hiding("budgets"), "budgets", 1)).toBeNull();
	});

	test("swaps with the next visible widget and leaves a hidden one where it is", () => {
		const change = moveWidget(hiding("budgets"), "recent", 1);
		expect(ids(change?.widgets ?? []).slice(0, 3)).toEqual([
			"categories",
			"budgets",
			"recent",
		]);
		expect(change?.widgets[1]?.hidden).toBe(true);
	});

	test("counts positions among the visible widgets only", () => {
		const change = moveWidget(hiding("budgets", "goals"), "categories", -1);
		expect(change?.announcement).toBe(
			"Spending by category moved to position 1 of 6.",
		);
	});

	test("is the last visible widget when only hidden ones follow", () => {
		expect(moveWidget(hiding("heatmap"), "investments", 1)).toBeNull();
	});

	test("never changes its input", () => {
		const input = view();
		const copy = structuredClone(input);
		moveWidget(input, "budgets", -1);
		expect(input).toEqual(copy);
	});

	test("keeps sizes and flags with their widgets", () => {
		const input = view();
		(input[1] as WidgetEntry).size = 6;
		const change = moveWidget(input, "budgets", -1);
		expect(change?.widgets[0]).toEqual({
			id: "budgets",
			size: 6,
			hidden: false,
		});
	});
});

describe("setWidgetSize", () => {
	test("sets a size and announces it", () => {
		const change = setWidgetSize(view(), "budgets", 4);
		expect(change?.widgets[1]).toEqual({
			id: "budgets",
			size: 4,
			hidden: false,
		});
		expect(change?.announcement).toBe("Budgets is now ⅔ width.");
	});

	test.each([
		[2, "⅓ width"],
		[3, "½ width"],
		[4, "⅔ width"],
		[6, "Full width"],
	] as const)("size %i reads %s", (size, text) => {
		const start = hiding().map((entry) => ({
			...entry,
			size: (size === 2 ? 3 : 2) as WidgetSize,
		}));
		expect(setWidgetSize(start, "goals", size)?.announcement).toBe(
			`Goals is now ${text}.`,
		);
	});

	test("does nothing when the widget already has the size", () => {
		expect(setWidgetSize(view(), "budgets", 3)).toBeNull();
	});

	test("does nothing for an unknown or hidden widget", () => {
		expect(setWidgetSize(view(), "nothing", 4)).toBeNull();
		expect(setWidgetSize(hiding("goals"), "goals", 4)).toBeNull();
	});

	test("never changes its input", () => {
		const input = view();
		const copy = structuredClone(input);
		setWidgetSize(input, "budgets", 6);
		expect(input).toEqual(copy);
	});
});

describe("hideWidget (BR-F08-24)", () => {
	test("hides a visible widget and announces it", () => {
		const result = hideWidget(view(), "investments");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.change.widgets.find((e) => e.id === "investments")?.hidden,
		).toBe(true);
		expect(result.change.announcement).toBe("Investments hidden.");
	});

	test("keeps the widget's place and size", () => {
		const result = hideWidget(view(), "budgets");
		if (!result.ok) throw new Error("expected ok");
		expect(result.change.widgets[1]).toEqual({
			id: "budgets",
			size: 3,
			hidden: true,
		});
		expect(ids(result.change.widgets)).toEqual(ids(view()));
	});

	test("refuses to hide the last visible widget", () => {
		const onlyGoals = hiding(...ids(view()).filter((id) => id !== "goals"));
		expect(hideWidget(onlyGoals, "goals")).toEqual({
			ok: false,
			message: "Keep at least one widget on your dashboard.",
		});
	});

	test("hides the second to last visible widget", () => {
		const two = hiding(
			...ids(view()).filter((id) => id !== "goals" && id !== "recent"),
		);
		expect(hideWidget(two, "goals").ok).toBe(true);
	});

	test("answers an empty message for a widget that is not visible", () => {
		expect(hideWidget(view(), "nothing")).toEqual({ ok: false, message: "" });
		expect(hideWidget(hiding("goals"), "goals")).toEqual({
			ok: false,
			message: "",
		});
	});

	test("never changes its input", () => {
		const input = view();
		const copy = structuredClone(input);
		hideWidget(input, "goals");
		expect(input).toEqual(copy);
	});
});

describe("showWidget (BR-F08-25)", () => {
	test("shows a hidden widget again at the end and announces it", () => {
		const change = showWidget(hiding("budgets"), "budgets");
		expect(ids(change?.widgets ?? []).at(-1)).toBe("budgets");
		expect(change?.widgets.at(-1)).toEqual({
			id: "budgets",
			size: 3,
			hidden: false,
		});
		expect(change?.announcement).toBe("Budgets added.");
	});

	test("keeps the other widgets in order", () => {
		const change = showWidget(hiding("budgets"), "budgets");
		expect(ids(change?.widgets ?? [])).toEqual([
			"recent",
			"categories",
			"incomeExpenses",
			"goals",
			"upcoming",
			"investments",
			"heatmap",
			"budgets",
		]);
	});

	test("keeps the size the widget had", () => {
		const input = hiding("goals");
		(input[4] as WidgetEntry).size = 6;
		expect(showWidget(input, "goals")?.widgets.at(-1)?.size).toBe(6);
	});

	test("does nothing for a visible or unknown widget", () => {
		expect(showWidget(view(), "budgets")).toBeNull();
		expect(showWidget(view(), "nothing")).toBeNull();
	});

	test("never changes its input", () => {
		const input = hiding("budgets");
		const copy = structuredClone(input);
		showWidget(input, "budgets");
		expect(input).toEqual(copy);
	});
});

describe("resetWidgets (BR-F08-21)", () => {
	test("gives Overview's widgets and says so", () => {
		const change = resetWidgets();
		expect(change.widgets).toEqual(defaultWidgets());
		expect(change.announcement).toBe("Reset to the default layout.");
	});
});
