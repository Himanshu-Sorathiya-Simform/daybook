import { describe, expect, test } from "vitest";

import { GOLDEN_GOALS, GOLDEN_TODAY } from "../../../../seed/golden";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import {
	ALL_TRANSACTIONS,
	VIEW_LIMIT,
	fromViewFilter,
	isEdited,
	toViewFilter,
	viewCreateSchema,
	viewDeleteSchema,
	viewEditSchema,
	viewName,
	type ViewFilter,
} from "@/lib/transactions/views";

const ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02";
const DEFAULT_LIST: ListParams = { sort: "date", dir: "desc", group: "day" };

// F03 section 15's illustrated view.
const FOOD_LAST_MONTH = {
	id: ID,
	name: "Food last month",
	filter: { range: "last_month", cat: ["food"] },
	sort: "date",
	dir: "desc",
	group: "day",
};

function errors(
	schema: ReturnType<typeof viewCreateSchema> | ReturnType<typeof viewEditSchema>,
	body: unknown,
) {
	const result = schema.safeParse(body);
	if (result.success) return {};
	const fields: Record<string, string> = {};
	for (const issue of result.error.issues) {
		fields[issue.path.join(".") || "_body"] ??= issue.message;
	}
	return fields;
}
const create = viewCreateSchema("INR");
const edit = viewEditSchema("INR");
const createErrors = (changes: Record<string, unknown>) =>
	errors(create, { ...FOOD_LAST_MONTH, ...changes });
const filterErrors = (
	filter: Record<string, unknown>,
	extra: Record<string, unknown> = {},
) => errors(create, { ...FOOD_LAST_MONTH, filter, ...extra });

describe("the built-in view (BR-F03-63)", () => {
	test("All Transactions is all time, newest first, grouped by day", () => {
		expect(ALL_TRANSACTIONS).toEqual({
			id: "all",
			name: "All Transactions",
			filter: {},
			sort: "date",
			dir: "desc",
			group: "day",
		});
	});

	test("a user keeps at most 20 saved views", () => {
		expect(VIEW_LIMIT).toBe(20);
	});
});

describe("the create body (BR-F03-63, BR-F03-64)", () => {
	test("accepts the spec's illustrated view", () => {
		expect(create.parse(FOOD_LAST_MONTH)).toEqual(FOOD_LAST_MONTH);
	});

	describe("names", () => {
		// AC-F03-47, at the schema level.
		test("are trimmed", () => {
			expect(create.parse({ ...FOOD_LAST_MONTH, name: "  Food  " }).name).toBe(
				"Food",
			);
		});

		test("take 1 to 40 characters", () => {
			expect(createErrors({ name: "a".repeat(40) })).toEqual({});
			expect(createErrors({ name: "a".repeat(41) })).toEqual({
				name: "Use 40 characters or fewer.",
			});
			expect(createErrors({ name: "" })).toEqual({ name: "Enter a name." });
			expect(createErrors({ name: "   " })).toEqual({ name: "Enter a name." });
			expect(createErrors({ name: undefined })).toEqual({
				name: "Enter a name.",
			});
		});

		test("refuse control characters", () => {
			expect(createErrors({ name: "Food\tview" })).toEqual({
				name: "Remove unsupported characters.",
			});
		});

		test("never take the built-in name, in any case", () => {
			for (const name of [
				"All Transactions",
				"ALL TRANSACTIONS",
				" all transactions ",
				// B9, D-497: Postgres's `lower()` turns the dotted İ into i.
				"ALL TRANSACTİONS",
			]) {
				expect(createErrors({ name })).toEqual({
					name: "You already have a view with this name.",
				});
			}
			expect(createErrors({ name: "All Transactions 2" })).toEqual({});
		});
	});

	// AC-F03-48, at the schema level: each refusal carries its field path.
	describe("filters", () => {
		test.each([
			[
				{ range: "custom" },
				"filter.range",
				"Use a preset other than All time or Custom.",
			],
			[
				{ range: "all" },
				"filter.range",
				"Use a preset other than All time or Custom.",
			],
			[
				{ range: "last_month", from: "2026-10-01", to: "2026-10-31" },
				"filter.range",
				"Send a preset or dates, not both.",
			],
			[
				{ from: "2026-10-31", to: "2026-10-01" },
				"filter.from",
				"Send both dates, the first on or before the second.",
			],
			[
				{ from: "2026-10-01" },
				"filter.from",
				"Send both dates, the first on or before the second.",
			],
			[
				{ to: "2026-10-31" },
				"filter.from",
				"Send both dates, the first on or before the second.",
			],
			[
				{ from: "2026-02-30", to: "2026-03-31" },
				"filter.from",
				"Use a date as YYYY-MM-DD.",
			],
			[{ type: ["expense", "transfer"] }, "filter.type.1", "Choose a type."],
			[{ cat: ["food", "pizza"] }, "filter.cat.1", "Choose a category."],
			[{ goal: "vacation" }, "filter.goal", "Use a UUID."],
			[{ sub: "netflix" }, "filter.sub", "Use a UUID."],
			[{ src: "bank" }, "filter.src", "Choose a source."],
			[{ q: "ab" }, "filter.q", "Type at least 3 characters, or an amount."],
			[{ q: "a".repeat(101) }, "filter.q", "Use 100 characters or fewer."],
			[{ q: "ab\tc" }, "filter.q", "Remove unsupported characters."],
			// B3, Q3, D-498: neither may reach `jsonb` or split a line.
			[{ q: "cafe\ud800 bar" }, "filter.q", "Remove unsupported characters."],
			[{ q: "cafe\udc00 bar" }, "filter.q", "Remove unsupported characters."],
			[{ q: "cafe\u2028bar" }, "filter.q", "Remove unsupported characters."],
			[{ month: "2026-10" }, "filter", 'Unrecognized key: "month"'],
			[{ min: "500.00" }, "filter", 'Unrecognized key: "min"'],
		] as [Record<string, unknown>, string, string][])(
			"refuses %j at %s",
			(filter, path, message) => {
				expect(filterErrors(filter)).toEqual({ [path]: message });
			},
		);

		test.each([
			[{ minMinor: 0 }, "filter.minMinor", "Enter an amount above zero."],
			[{ maxMinor: -1 }, "filter.maxMinor", "Enter an amount above zero."],
			[
				{ minMinor: 1.5 },
				"filter.minMinor",
				"Send the amount as a whole number of minor units.",
			],
			[
				{ maxMinor: 100000000000 },
				"filter.maxMinor",
				"The largest amount is 999,999,999.99.",
			],
			[
				{ minMinor: 90000, maxMinor: 10000 },
				"filter.minMinor",
				"The lowest amount can't be above the highest.",
			],
		] as [Record<string, unknown>, string, string][])(
			"refuses amounts %j at %s",
			(filter, path, message) => {
				expect(filterErrors(filter, { currency: "INR" })).toEqual({
					[path]: message,
				});
			},
		);

		test("needs the currency whenever the filter holds an amount", () => {
			expect(filterErrors({ minMinor: 50000 })).toEqual({
				currency: "Send the currency with the amount.",
			});
			expect(filterErrors({ minMinor: 50000 }, { currency: "INR" })).toEqual(
				{},
			);
			expect(filterErrors({ minMinor: 50000 }, { currency: "AUD" })).toEqual({
				currency: "Use a supported currency.",
			});
		});

		test("checks amounts and searches against the profile currency it was made for", () => {
			const yen = viewCreateSchema("JPY");
			expect(
				errors(yen, {
					...FOOD_LAST_MONTH,
					filter: { maxMinor: 999999999 },
					currency: "JPY",
				}),
			).toEqual({});
			expect(
				errors(yen, {
					...FOOD_LAST_MONTH,
					filter: { maxMinor: 1000000000 },
					currency: "JPY",
				}),
			).toEqual({
				"filter.maxMinor": "The largest amount is 999,999,999.",
			});
		});

		test("accepts amounts equal at both ends, and a short numeric search", () => {
			expect(
				filterErrors(
					{ minMinor: 50000, maxMinor: 50000, q: "12" },
					{ currency: "INR" },
				),
			).toEqual({});
		});

		test("accepts a range of one day", () => {
			expect(filterErrors({ from: "2026-10-19", to: "2026-10-19" })).toEqual(
				{},
			);
		});

		test("stores lists sorted and deduplicated, and an empty list as absent", () => {
			expect(
				create.parse({
					...FOOD_LAST_MONTH,
					filter: { cat: ["shopping", "food", "food"], type: [] },
				}).filter,
			).toEqual({
				cat: ["food", "shopping"],
			});
		});

		test("stores ids in lowercase and the search trimmed", () => {
			const goal = GOLDEN_GOALS.vacation.id;
			expect(
				create.parse({
					...FOOD_LAST_MONTH,
					filter: { goal: goal.toUpperCase(), q: "  swiggy " },
				}).filter,
			).toEqual({
				goal,
				q: "swiggy",
			});
		});

		test("stores a blank search as absent", () => {
			expect(
				create.parse({ ...FOOD_LAST_MONTH, filter: { q: "   " } }).filter,
			).toEqual({});
		});

		test("accepts every field together", () => {
			const filter: ViewFilter = {
				from: "2026-09-01",
				to: "2026-10-31",
				type: ["expense", "refund"],
				cat: ["food"],
				goal: GOLDEN_GOALS.vacation.id,
				sub: GOLDEN_GOALS.emergencyFund.id,
				src: "manual",
				minMinor: 100,
				maxMinor: 500000,
				q: "swiggy",
			};
			expect(
				create.parse({ ...FOOD_LAST_MONTH, filter, currency: "INR" }),
			).toMatchObject({ filter });
		});
	});

	describe("list parameters", () => {
		test("day grouping needs the date sort (BR-F03-55)", () => {
			expect(createErrors({ sort: "amount", group: "day" })).toEqual({
				group: "Day grouping needs the date sort.",
			});
			expect(createErrors({ sort: "amount", group: "payee" })).toEqual({});
		});

		test.each([
			["sort", "price", "Choose a sort."],
			["dir", "up", "Choose a direction."],
			["group", "week", "Choose a grouping."],
		])("refuses %s %j", (field, value, message) => {
			expect(createErrors({ [field]: value })).toEqual({ [field]: message });
		});
	});

	test("needs a UUIDv7 id", () => {
		expect(createErrors({ id: "all" })).toEqual({ id: "Use a UUIDv7 id." });
	});

	test("refuses a key it does not know", () => {
		expect(createErrors({ position: 3 })).toEqual({
			_body: 'Unrecognized key: "position"',
		});
	});
});

describe("the edit body (BR-F03-68, BR-F03-69)", () => {
	const LIST = {
		filter: { cat: ["food"] },
		sort: "date",
		dir: "desc",
		group: "day",
	};

	test("takes a name alone", () => {
		expect(edit.parse({ name: " Groceries " })).toEqual({ name: "Groceries" });
	});

	test("takes the filter, sort, direction and group together", () => {
		expect(edit.parse(LIST)).toEqual(LIST);
		expect(edit.parse({ ...LIST, name: "Food" })).toEqual({
			...LIST,
			name: "Food",
		});
	});

	test("refuses part of the four", () => {
		for (const field of ["filter", "sort", "dir", "group"]) {
			const partial = Object.fromEntries(
				Object.entries(LIST).filter(([key]) => key !== field),
			);
			expect(errors(edit, partial)).toEqual({
				_body: "Send the filter, sort, direction and group together.",
			});
		}
		expect(errors(edit, { filter: { cat: ["food"] } })).toEqual({
			_body: "Send the filter, sort, direction and group together.",
		});
	});

	test("refuses a body with no change", () => {
		expect(errors(edit, {})).toEqual({ _body: "Send at least one change." });
	});

	test("applies the create's rules to what it sends", () => {
		expect(errors(edit, { name: "all transactions" })).toEqual({
			name: "You already have a view with this name.",
		});
		expect(errors(edit, { ...LIST, sort: "amount" })).toEqual({
			group: "Day grouping needs the date sort.",
		});
		expect(errors(edit, { ...LIST, filter: { minMinor: 100 } })).toEqual({
			currency: "Send the currency with the amount.",
		});
	});

	test("refuses the id", () => {
		expect(errors(edit, { name: "Food", id: ID })).toEqual({
			_body: 'Unrecognized key: "id"',
		});
	});
});

// AC-F03-49
describe("the delete body", () => {
	test("accepts an empty body", () => {
		expect(viewDeleteSchema.parse({})).toEqual({});
	});

	test("refuses any field, the view's own included", () => {
		for (const body of [{ name: "Food" }, { version: 1 }, { id: ID }]) {
			expect(viewDeleteSchema.safeParse(body).success).toBe(false);
		}
	});
});

describe("dates in a view (D-453)", () => {
	test("on 2026-11-02, October's dates are saved as last_month", () => {
		expect(
			toViewFilter({ from: "2026-10-01", to: "2026-10-31" }, GOLDEN_TODAY),
		).toEqual({
			range: "last_month",
		});
	});

	test("that view applied on 2027-01-15 writes December's dates", () => {
		expect(fromViewFilter({ range: "last_month" }, "2027-01-15")).toEqual({
			from: "2026-12-01",
			to: "2026-12-31",
		});
	});

	test("dates that match no preset are saved as they are", () => {
		expect(
			toViewFilter({ from: "2026-10-05", to: "2026-10-20" }, GOLDEN_TODAY),
		).toEqual({
			from: "2026-10-05",
			to: "2026-10-20",
		});
	});

	test("all time saves neither", () => {
		expect(toViewFilter({ cat: ["food"] }, GOLDEN_TODAY)).toEqual({
			cat: ["food"],
		});
		expect(fromViewFilter({ cat: ["food"] }, GOLDEN_TODAY)).toEqual({
			cat: ["food"],
		});
	});

	test("every preset round-trips on the golden day", () => {
		for (const range of [
			"this_month",
			"last_month",
			"last_3_months",
			"year_to_date",
			"last_12_months",
		] as const) {
			expect(
				toViewFilter(fromViewFilter({ range }, GOLDEN_TODAY), GOLDEN_TODAY),
			).toEqual({ range });
		}
	});

	test("every other field passes through unchanged, in the URL's key order", () => {
		const filter: TransactionFilter = {
			from: "2026-10-01",
			to: "2026-10-31",
			type: ["expense"],
			cat: ["food"],
			src: "manual",
			minMinor: 100,
			q: "swiggy",
		};
		const view = toViewFilter(filter, GOLDEN_TODAY);
		expect(view).toEqual({
			range: "last_month",
			type: ["expense"],
			cat: ["food"],
			src: "manual",
			minMinor: 100,
			q: "swiggy",
		});
		expect(fromViewFilter(view, GOLDEN_TODAY)).toEqual(filter);
		expect(Object.keys(fromViewFilter(view, GOLDEN_TODAY))).toEqual(
			Object.keys(filter),
		);
	});
});

// AC-F03-50
describe("isEdited (BR-F03-66)", () => {
	const view = {
		filter: { range: "last_month", cat: ["food"] } as ViewFilter,
		...DEFAULT_LIST,
	};
	const context = { today: GOLDEN_TODAY, currency: "INR" } as const;
	const applied: TransactionFilter = {
		from: "2026-10-01",
		to: "2026-10-31",
		cat: ["food"],
	};

	test("a view just applied is not edited", () => {
		expect(
			isEdited(view, { filter: applied, list: DEFAULT_LIST }, context),
		).toBe(false);
	});

	test("adding a filter makes it edited", () => {
		expect(
			isEdited(
				view,
				{ filter: { ...applied, type: ["expense"] }, list: DEFAULT_LIST },
				context,
			),
		).toBe(true);
	});

	test("switching the grouping makes it edited", () => {
		expect(
			isEdited(
				view,
				{ filter: applied, list: { ...DEFAULT_LIST, group: "payee" } },
				context,
			),
		).toBe(true);
	});

	test("changing the sort or the direction makes it edited", () => {
		expect(
			isEdited(
				view,
				{
					filter: applied,
					list: { sort: "amount", dir: "desc", group: "none" },
				},
				context,
			),
		).toBe(true);
		expect(
			isEdited(
				view,
				{ filter: applied, list: { ...DEFAULT_LIST, dir: "asc" } },
				context,
			),
		).toBe(true);
	});

	test("the same filter written another way is not edited", () => {
		const reordered: TransactionFilter = {
			cat: ["food", "food"],
			to: "2026-10-31",
			from: "2026-10-01",
		};
		expect(
			isEdited(view, { filter: reordered, list: DEFAULT_LIST }, context),
		).toBe(false);
	});

	// F03 section 13: a "This month" view at midnight on the 1st.
	test("a This month view turns edited when the month changes under it", () => {
		const thisMonth = {
			filter: { range: "this_month" } as ViewFilter,
			...DEFAULT_LIST,
		};
		const november: TransactionFilter = { from: "2026-11-01", to: "2026-11-30" };
		expect(
			isEdited(thisMonth, { filter: november, list: DEFAULT_LIST }, context),
		).toBe(false);
		expect(
			isEdited(
				thisMonth,
				{ filter: november, list: DEFAULT_LIST },
				{ ...context, today: "2026-12-01" },
			),
		).toBe(true);
	});

	test("All Transactions is edited by any filter", () => {
		expect(
			isEdited(ALL_TRANSACTIONS, { filter: {}, list: DEFAULT_LIST }, context),
		).toBe(false);
		expect(
			isEdited(
				ALL_TRANSACTIONS,
				{ filter: { q: "swiggy" }, list: DEFAULT_LIST },
				context,
			),
		).toBe(true);
	});
});

// AC-F03-51
describe("viewName (BR-F03-67)", () => {
	test("joins the chip labels", () => {
		expect(viewName(["Food", "Last month"], [])).toBe("Food, Last month");
	});

	test("adds 2 when the name is taken, comparing without case", () => {
		expect(viewName(["Food", "Last month"], ["food, last month"])).toBe(
			"Food, Last month 2",
		);
	});

	test("takes the first free number", () => {
		expect(viewName(["Food"], ["Food", "Food 2", "Food 4"])).toBe("Food 3");
	});

	// B9, D-497: the unique index compares `lower(name)` in Postgres, so İ and i collide there.
	test("compares names as Postgres does: İstanbul and istanbul are one name", () => {
		expect(viewName(["İstanbul"], ["istanbul"])).toBe("İstanbul 2");
		expect(viewName(["istanbul"], ["İSTANBUL"])).toBe("istanbul 2");
		expect(viewName(["ΟΔΟΣ"], ["οδοσ"])).toBe("ΟΔΟΣ 2");
	});

	test("compares the numbered names the same way", () => {
		expect(viewName(["İstanbul"], ["istanbul", "istanbul 2"])).toBe(
			"İstanbul 3",
		);
	});

	test("is My view with no chip", () => {
		expect(viewName([], [])).toBe("My view");
		expect(viewName([], ["My view"])).toBe("My view 2");
	});

	test("never takes the built-in name", () => {
		expect(viewName(["All Transactions"], [])).toBe("All Transactions 2");
	});

	test("cuts a long name to 40 characters, and its numbered form too", () => {
		const label = "a".repeat(60);
		expect(viewName([label], [])).toBe("a".repeat(40));
		expect(viewName([label], ["a".repeat(40)])).toBe(`${"a".repeat(38)} 2`);
		expect([...viewName([label], ["a".repeat(40)])]).toHaveLength(40);
	});

	test("counts the cut in code points", () => {
		expect([...viewName(["👍".repeat(50)], [])]).toHaveLength(40);
	});

	test("never ends on a comma or a space after the cut", () => {
		const labels = ["a".repeat(38), "Food"];
		expect(viewName(labels, [])).toBe("a".repeat(38));
		expect(viewName(labels, ["a".repeat(38)])).toBe(`${"a".repeat(38)} 2`);
	});
});
