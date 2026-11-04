import { describe, expect, test } from "vitest";

import type { GroupTotal } from "@/server/dal/transactions/list";
import { groupKeyOf, sectionsOf } from "../sections";
import { idOf, page, row } from "./fixtures";

const total = (key: string, count: number, outMinor = 0): GroupTotal => ({
	key,
	label: null,
	count,
	inMinor: 0,
	outMinor,
	toGoalsMinor: 0,
});

const goal = (n: number) =>
	row({
		id: idOf(n),
		type: "goal_contribution",
		payee: null,
		category: null,
		goalId: "0192f0c4-7a1e-7c3b-9d2a-0000000000aa",
	});

describe("groupKeyOf (BR-F03-55)", () => {
	test("under day grouping, the row's occurredOn, never its UTC date", () => {
		// Golden #26: 1 Nov in Kolkata, 31 Oct in UTC.
		expect(
			groupKeyOf(
				row({
					occurredOn: "2026-11-01",
					occurredAt: "2026-10-31T19:00:00.000Z",
				}),
				"day",
			),
		).toBe("2026-11-01");
	});

	test("under category grouping, the category key", () => {
		expect(groupKeyOf(row({ category: "housing" }), "category")).toBe("housing");
	});

	test("under payee grouping, the payee lowercased as Postgres lowers it", () => {
		expect(groupKeyOf(row({ payee: "SWIGGY" }), "payee")).toBe("swiggy");
		expect(groupKeyOf(row({ payee: "İstanbul Café" }), "payee")).toBe(
			"istanbul café",
		);
	});

	test.each(["category", "payee"] as const)(
		"under %s grouping, a Goal row keys as goal:<goalId>",
		(group) => {
			expect(groupKeyOf(goal(1), group)).toBe(
				"goal:0192f0c4-7a1e-7c3b-9d2a-0000000000aa",
			);
		},
	);

	test("a row with neither its own key nor a Goal id still keys as a Goal group", () => {
		expect(groupKeyOf(row({ category: null, goalId: null }), "category")).toBe(
			"goal:",
		);
		expect(groupKeyOf(row({ payee: null, goalId: null }), "payee")).toBe(
			"goal:",
		);
	});

	test("under no grouping, every row shares one key", () => {
		expect(groupKeyOf(row(), "none")).toBe("");
		expect(groupKeyOf(goal(1), "none")).toBe("");
	});

	test("a Goal row under day grouping keys by its day", () => {
		expect(groupKeyOf(goal(1), "day")).toBe("2026-10-19");
	});
});

describe("sectionsOf (BR-F03-56)", () => {
	test("no pages, or pages with no rows, make no sections", () => {
		expect(sectionsOf([], "day")).toEqual([]);
		expect(sectionsOf([page(), page()], "day")).toEqual([]);
	});

	test("rows in a run with one key share a section, in order", () => {
		const a = row({ id: idOf(1), occurredOn: "2026-11-01" });
		const b = row({ id: idOf(2), occurredOn: "2026-11-01" });
		const c = row({ id: idOf(3), occurredOn: "2026-10-31" });
		const sections = sectionsOf(
			[
				page({
					items: [a, b, c],
					groups: [total("2026-11-01", 2), total("2026-10-31", 1)],
				}),
			],
			"day",
		);
		expect(sections).toEqual([
			{ key: "2026-11-01", total: total("2026-11-01", 2), rows: [a, b] },
			{ key: "2026-10-31", total: total("2026-10-31", 1), rows: [c] },
		]);
	});

	test("a group that spans two pages stays one section, with the later page's totals", () => {
		const a = row({ id: idOf(1), category: "food" });
		const b = row({ id: idOf(2), category: "food" });
		const sections = sectionsOf(
			[
				page({ items: [a], groups: [total("food", 4, 600000)] }),
				page({ items: [b], groups: [total("food", 5, 622000)] }),
			],
			"category",
		);
		expect(sections).toHaveLength(1);
		expect(sections[0]).toEqual({
			key: "food",
			total: total("food", 5, 622000),
			rows: [a, b],
		});
	});

	test("a group's totals come from a page that carries them even if its rows are on another", () => {
		const a = row({ id: idOf(1), category: "food" });
		const sections = sectionsOf(
			[page({ items: [a], groups: [] }), page({ groups: [total("food", 4)] })],
			"category",
		);
		expect(sections[0]?.total).toEqual(total("food", 4));
	});

	test("a section whose group no page carries has null totals", () => {
		const sections = sectionsOf([page({ items: [row()] })], "day");
		expect(sections[0]?.total).toBeNull();
	});

	test("under no grouping, every row of every page is one section", () => {
		const rows = [1, 2, 3].map((n) =>
			row({ id: idOf(n), category: n === 2 ? "housing" : "food" }),
		);
		const sections = sectionsOf(
			[page({ items: rows.slice(0, 2) }), page({ items: rows.slice(2) })],
			"none",
		);
		expect(sections).toEqual([{ key: "", total: null, rows }]);
	});

	test("a key that comes back after another starts a new section, as the rows say", () => {
		const a = row({ id: idOf(1), category: "food" });
		const b = row({ id: idOf(2), category: "housing" });
		const c = row({ id: idOf(3), category: "food" });
		expect(
			sectionsOf([page({ items: [a, b, c] })], "category").map((s) => s.key),
		).toEqual(["food", "housing", "food"]);
	});

	test("payee groups match their totals whatever the case of each row", () => {
		const a = row({ id: idOf(1), payee: "Swiggy" });
		const b = row({ id: idOf(2), payee: "SWIGGY" });
		const sections = sectionsOf(
			[
				page({
					items: [a, b],
					groups: [{ ...total("swiggy", 5), label: "SWIGGY" }],
				}),
			],
			"payee",
		);
		expect(sections).toHaveLength(1);
		expect(sections[0]?.total?.label).toBe("SWIGGY");
	});

	test("never changes the pages it is given", () => {
		const pages = [page({ items: [row()], groups: [total("2026-10-19", 1)] })];
		const copy = structuredClone(pages);
		sectionsOf(pages, "day");
		expect(pages).toEqual(copy);
	});
});
