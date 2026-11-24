import { describe, expect, test } from "vitest";

import { DASHBOARD_MESSAGES as M } from "../messages";
import { layoutPutSchema, parseDashboardMonth } from "../schemas";
import { defaultWidgets } from "../views";
import { NINE, TEN, VIEW_ID, VIEW_ID_2 } from "./golden";

const TODAY = "2026-11-02";

describe("parseDashboardMonth (BR-F08-01)", () => {
	test("defaults to the current month", () => {
		expect(parseDashboardMonth(null, TODAY)).toEqual({
			ok: true,
			month: "2026-11",
		});
		expect(parseDashboardMonth(undefined, TODAY)).toEqual({
			ok: true,
			month: "2026-11",
		});
	});

	test.each(["2026-11", "2026-10", "2000-01", "2026-01"])(
		"accepts %s",
		(month) => {
			expect(parseDashboardMonth(month, TODAY)).toEqual({ ok: true, month });
		},
	);

	test.each([
		["a month in the future", "2026-12"],
		["a year ahead", "2027-11"],
		["before 2000-01", "1999-12"],
		["without the zero", "2026-1"],
		["month 13", "2026-13"],
		["month 00", "2026-00"],
		["a full date", "2026-10-01"],
		["text", "october"],
		["empty", ""],
		["spaces", " 2026-10"],
		["a long year", "20260-10"],
	])("refuses %s", (_name, value) => {
		expect(parseDashboardMonth(value, TODAY)).toEqual({
			ok: false,
			message: M.month,
		});
	});

	test("takes the month from the date it is given, so a new month moves the limit", () => {
		expect(parseDashboardMonth("2026-12", "2026-12-01").ok).toBe(true);
		expect(parseDashboardMonth("2026-12", "2026-11-30").ok).toBe(false);
	});
});

const view = (changes: Record<string, unknown> = {}) => ({
	id: VIEW_ID,
	name: "Budget watch",
	widgets: [
		{ id: "budgets", size: 4, hidden: false },
		{ id: "investments", size: 2, hidden: true },
	],
	changedAt: TEN,
	deleted: false,
	...changes,
});
const body = (views: unknown[] = [view()], ...format: unknown[]) => ({
	formatVersion: format.length > 0 ? format[0] : 1,
	views,
});

const issues = (input: unknown) => {
	const result = layoutPutSchema.safeParse(input);
	return result.success ?
			[]
		:	result.error.issues.map((i) => [i.path.join("."), i.message]);
};

describe("layoutPutSchema (BR-F08-23)", () => {
	test("accepts F08 section 15's view and normalizes its widgets", () => {
		const result = layoutPutSchema.parse(body());
		expect(result.views).toHaveLength(1);
		expect(result.views[0]).toMatchObject({
			id: VIEW_ID,
			name: "Budget watch",
			changedAt: TEN,
			deleted: false,
		});
		// The two entries come first, the six missing registry widgets follow, visible.
		expect(result.views[0]?.widgets).toHaveLength(8);
		expect(result.views[0]?.widgets.slice(0, 2)).toEqual([
			{ id: "budgets", size: 4, hidden: false },
			{ id: "investments", size: 2, hidden: true },
		]);
	});

	test("lower-cases the id", () => {
		const result = layoutPutSchema.parse(
			body([view({ id: VIEW_ID.toUpperCase() })]),
		);
		expect(result.views[0]?.id).toBe(VIEW_ID);
	});

	test("trims and normalizes the name", () => {
		const result = layoutPutSchema.parse(
			body([view({ name: "  Budget watch  " })]),
		);
		expect(result.views[0]?.name).toBe("Budget watch");
	});

	test("accepts 1 and 40 characters, and 40 code points of emoji", () => {
		for (const name of ["A", "x".repeat(40), "👍".repeat(40)]) {
			expect(layoutPutSchema.safeParse(body([view({ name })])).success).toBe(
				true,
			);
		}
	});

	test.each([
		["empty", "", M.nameRequired],
		["blank", "   ", M.nameRequired],
		["41 characters", "x".repeat(41), M.nameTooLong],
		["41 code points", "👍".repeat(41), M.nameTooLong],
		["a tab inside", "Budget\twatch", "Remove unsupported characters."],
		["a line feed inside", "Budget\nwatch", "Remove unsupported characters."],
	])("refuses a name that is %s", (_name, name, message) => {
		expect(issues(body([view({ name })]))).toEqual([["views.0.name", message]]);
	});

	test("refuses a name that is not text, or is missing", () => {
		expect(issues(body([view({ name: 4 })]))[0]?.[0]).toBe("views.0.name");
		expect(issues(body([view({ name: undefined })]))[0]?.[0]).toBe(
			"views.0.name",
		);
	});

	test("refuses an id that is not a UUIDv7, `overview` included", () => {
		for (const id of [
			"overview",
			"",
			4,
			"0199a000-0000-4000-8001-000000000001",
		]) {
			expect(issues(body([view({ id })]))).toEqual([["views.0.id", M.id]]);
		}
	});

	test("refuses a change time that is not an instant", () => {
		for (const changedAt of ["", "yesterday", "2026-11-02", 5, null]) {
			expect(issues(body([view({ changedAt })]))).toEqual([
				["views.0.changedAt", M.instant],
			]);
		}
	});

	test("refuses a `deleted` that is not true or false", () => {
		for (const deleted of ["no", 0, null, undefined]) {
			expect(issues(body([view({ deleted })]))[0]).toEqual([
				"views.0.deleted",
				M.boolean,
			]);
		}
	});

	describe("widgets", () => {
		test("refuse anything but a list", () => {
			for (const widgets of [{}, "budgets", 3, null, undefined]) {
				expect(issues(body([view({ widgets })]))).toEqual([
					["views.0.widgets", M.widgets],
				]);
			}
		});

		test("take 0 to 50 entries", () => {
			const entries = (count: number) =>
				Array.from({ length: count }, () => ({
					id: "goals",
					size: 2,
					hidden: false,
				}));
			expect(
				layoutPutSchema.safeParse(body([view({ widgets: entries(0) })]))
					.success,
			).toBe(true);
			expect(
				layoutPutSchema.safeParse(body([view({ widgets: entries(50) })]))
					.success,
			).toBe(true);
			expect(issues(body([view({ widgets: entries(51) })]))).toEqual([
				["views.0.widgets", M.widgets],
			]);
		});

		test.each([
			["a string", "goals"],
			["null", null],
			["a list", [["goals", 2, false]]],
			["no id", { size: 2, hidden: false }],
			["no size", { id: "goals", hidden: false }],
			["no hidden", { id: "goals", size: 2 }],
			["an id that is a number", { id: 3, size: 2, hidden: false }],
			[
				"an id of 65 characters",
				{ id: "a".repeat(65), size: 2, hidden: false },
			],
			["a size with a fraction", { id: "goals", size: 2.5, hidden: false }],
			["a size that is text", { id: "goals", size: "2", hidden: false }],
			["a size that is null", { id: "goals", size: null, hidden: false }],
			["a hidden that is text", { id: "goals", size: 2, hidden: "no" }],
			["a hidden that is a number", { id: "goals", size: 2, hidden: 0 }],
		])("refuse an entry that is %s", (_name, entry) => {
			expect(issues(body([view({ widgets: [entry] })]))[0]?.[1]).toBe(
				M.widget,
			);
		});

		test("are normalized, never refused: unknown ids, sizes, duplicates, all hidden", () => {
			const result = layoutPutSchema.parse(
				body([
					view({
						widgets: [
							{ id: "nothing", size: 2, hidden: false },
							{ id: "goals", size: 5, hidden: true },
							{ id: "goals", size: 6, hidden: false },
							{ id: "", size: 2, hidden: false },
						],
					}),
				]),
			);
			const widgets = result.views[0]?.widgets ?? [];
			expect(widgets.map((widget) => widget.id)).not.toContain("nothing");
			expect(widgets.filter((widget) => widget.id === "goals")).toEqual([
				{ id: "goals", size: 2, hidden: true },
			]);
		});

		test("make the first widget visible when all are hidden", () => {
			const widgets = defaultWidgets().map((widget) => ({
				...widget,
				hidden: true,
			}));
			const result = layoutPutSchema.parse(body([view({ widgets })]));
			expect(result.views[0]?.widgets[0]).toEqual({
				id: "recent",
				size: 3,
				hidden: false,
			});
		});

		test("an unknown formatVersion gives Overview's widgets", () => {
			const result = layoutPutSchema.parse(body([view()], 2));
			expect(result.views[0]?.widgets).toEqual(defaultWidgets());
		});

		test("an entry's extra field is dropped, not refused", () => {
			const result = layoutPutSchema.parse(
				body([
					view({
						widgets: [
							{ id: "goals", size: 2, hidden: false, title: "x" },
						],
					}),
				]),
			);
			expect(result.views[0]?.widgets[0]).toEqual({
				id: "goals",
				size: 2,
				hidden: false,
			});
		});
	});

	describe("a deleted view", () => {
		test("becomes a marker with an empty name and no widgets", () => {
			const result = layoutPutSchema.parse(body([view({ deleted: true })]));
			expect(result.views[0]).toEqual({
				id: VIEW_ID,
				name: "",
				widgets: [],
				changedAt: TEN,
				deleted: true,
			});
		});

		test("is not read for a name or widgets, so garbage there is ignored", () => {
			const result = layoutPutSchema.parse(
				body([view({ deleted: true, name: 42, widgets: "nothing" })]),
			);
			expect(result.views[0]).toMatchObject({
				name: "",
				widgets: [],
				deleted: true,
			});
		});

		test("needs neither a name nor widgets", () => {
			const marker = { id: VIEW_ID, changedAt: NINE, deleted: true };
			expect(layoutPutSchema.safeParse(body([marker])).success).toBe(true);
		});

		test("still needs a valid id and change time", () => {
			expect(issues(body([view({ deleted: true, id: "overview" })]))).toEqual([
				["views.0.id", M.id],
			]);
			expect(issues(body([view({ deleted: true, changedAt: "x" })]))).toEqual([
				["views.0.changedAt", M.instant],
			]);
		});
	});

	describe("the request", () => {
		test("takes 1 to 10 views", () => {
			const views = (count: number) =>
				Array.from({ length: count }, (_, index) =>
					view({
						id: `0199a000-0000-7000-8001-${String(index + 1).padStart(12, "0")}`,
					}),
				);
			expect(layoutPutSchema.safeParse(body(views(1))).success).toBe(true);
			expect(layoutPutSchema.safeParse(body(views(10))).success).toBe(true);
			expect(issues(body(views(0)))).toEqual([["views", M.views]]);
			expect(issues(body(views(11)))).toEqual([["views", M.views]]);
		});

		test("refuses views that are not a list", () => {
			expect(issues({ formatVersion: 1, views: "x" })).toEqual([
				["views", M.views],
			]);
			expect(issues({ formatVersion: 1 })).toEqual([["views", M.views]]);
		});

		test("refuses a view sent twice, however the id is spelled", () => {
			expect(issues(body([view(), view({ name: "Other" })]))).toEqual([
				["views.1.id", M.viewTwice],
			]);
			expect(
				issues(body([view(), view({ id: VIEW_ID.toUpperCase() })])),
			).toEqual([["views.1.id", M.viewTwice]]);
		});

		test("takes two different views", () => {
			const result = layoutPutSchema.parse(
				body([view(), view({ id: VIEW_ID_2, deleted: true })]),
			);
			expect(result.views.map((each) => each.deleted)).toEqual([false, true]);
		});

		test.each([["1.5"], [null], [undefined], ["1"], [1.5]])(
			"refuses a formatVersion of %j",
			(formatVersion) => {
				expect(issues(body([view()], formatVersion))).toEqual([
					["formatVersion", M.formatVersion],
				]);
			},
		);

		test("takes any whole formatVersion, and normalizes by it", () => {
			for (const formatVersion of [1, 2, 0, -1, 99]) {
				expect(
					layoutPutSchema.safeParse(body([view()], formatVersion)).success,
				).toBe(true);
			}
		});

		test("refuses what is not an object", () => {
			for (const input of [null, "x", 3, [], undefined]) {
				expect(layoutPutSchema.safeParse(input).success).toBe(false);
			}
		});

		test("drops a field it does not know", () => {
			const result = layoutPutSchema.parse({ ...body(), lastViewId: VIEW_ID });
			expect(Object.keys(result)).toEqual(["views"]);
		});

		test("keeps the order the client sent", () => {
			const result = layoutPutSchema.parse(
				body([view({ id: VIEW_ID_2, deleted: true }), view()]),
			);
			expect(result.views.map((each) => each.id)).toEqual([
				VIEW_ID_2,
				VIEW_ID,
			]);
		});

		test("reports a bad name and bad widgets of one view together", () => {
			const found = issues(body([view({ name: "", widgets: "x" })]));
			expect(found.map(([path]) => path).sort()).toEqual([
				"views.0.name",
				"views.0.widgets",
			]);
		});
	});
});
