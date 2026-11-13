import { describe, expect, test } from "vitest";

import { ApiError } from "../../../api/errors";
import {
	HISTORY_MONTHS,
	readHistoryQuery,
	readMonthQuery,
	readSummaryQuery,
} from "../query";

// The golden current month is November 2026, so the range is Nov 2023 to Nov 2027 (D-247).
const CURRENT = "2026-11";

const query = (text: string) => new URLSearchParams(text);

/** The parameters a 400 names, or a failure when nothing is refused. */
function refused(read: () => unknown): string[] {
	try {
		read();
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		expect(error.code).toBe("bad_request");
		return error.details["params"] as string[];
	}
	throw new Error("Nothing was refused.");
}

describe("readMonthQuery (BR-F04-14, D-566)", () => {
	test("is the current month without a month, or with an empty one", () => {
		expect(readMonthQuery(query(""), CURRENT)).toBe("2026-11");
		expect(readMonthQuery(query("month="), CURRENT)).toBe("2026-11");
	});

	test("reads a month, both ends of the range included", () => {
		expect(readMonthQuery(query("month=2026-10"), CURRENT)).toBe("2026-10");
		expect(readMonthQuery(query("month=2023-11"), CURRENT)).toBe("2023-11");
		expect(readMonthQuery(query("month=2027-11"), CURRENT)).toBe("2027-11");
	});

	// AC-F04-11: the month view refuses a month outside the range with 400.
	test.each(["2023-10", "2027-12", "1999-01"])(
		"refuses %s, outside the range",
		(month) => {
			expect(
				refused(() => readMonthQuery(query(`month=${month}`), CURRENT)),
			).toEqual(["month"]);
		},
	);

	test.each(["2026-13", "2026-1", "2026-11-01", "november", "%20"])(
		"refuses %j, which is no month",
		(month) => {
			expect(
				refused(() => readMonthQuery(query(`month=${month}`), CURRENT)),
			).toEqual(["month"]);
		},
	);

	test("refuses a repeated month, even a valid one", () => {
		expect(
			refused(() =>
				readMonthQuery(query("month=2026-10&month=2026-10"), CURRENT),
			),
		).toEqual(["month"]);
	});

	test("ignores parameters it doesn't know", () => {
		expect(readMonthQuery(query("month=2026-10&view=table&x=1"), CURRENT)).toBe(
			"2026-10",
		);
	});

	test("moves the range with the current month", () => {
		expect(readMonthQuery(query("month=2027-12"), "2026-12")).toBe("2027-12");
		expect(
			refused(() => readMonthQuery(query("month=2023-11"), "2026-12")),
		).toEqual(["month"]);
	});
});

describe("readHistoryQuery (BR-F04-35)", () => {
	test("reads a category, a month and a count", () => {
		expect(
			readHistoryQuery(query("category=food&to=2026-11&months=6"), CURRENT),
		).toEqual({ category: "food", to: "2026-11", count: 6 });
	});

	test("counts 6 months by default", () => {
		expect(HISTORY_MONTHS).toEqual({ min: 1, max: 49, default: 6 });
		expect(
			readHistoryQuery(query("category=food&to=2026-11"), CURRENT).count,
		).toBe(6);
		expect(
			readHistoryQuery(query("category=food&to=2026-11&months="), CURRENT)
				.count,
		).toBe(6);
	});

	test("takes 1 to 49 months, leading zeros included", () => {
		for (const [text, count] of [
			["1", 1],
			["49", 49],
			["06", 6],
		] as const) {
			expect(
				readHistoryQuery(
					query(`category=food&to=2026-11&months=${text}`),
					CURRENT,
				).count,
			).toBe(count);
		}
	});

	// AC-F04-20
	test.each(["0", "50", "-1", "6.5", "6a", " 6", "1e1", "999999999999999999999"])(
		"refuses months=%j",
		(months) => {
			expect(
				refused(() =>
					readHistoryQuery(
						query(`category=food&to=2026-11&months=${months}`),
						CURRENT,
					),
				),
			).toEqual(["months"]);
		},
	);

	// AC-F04-20: an income category, or none.
	test.each(["salary", "other_income", "groceries", "Food", ""])(
		"refuses category=%j",
		(category) => {
			expect(
				refused(() =>
					readHistoryQuery(
						query(`category=${category}&to=2026-11`),
						CURRENT,
					),
				),
			).toEqual(["category"]);
		},
	);

	test("takes an expense category with no Budget, such as health", () => {
		expect(
			readHistoryQuery(query("category=health&to=2026-10"), CURRENT).category,
		).toBe("health");
	});

	// AC-F04-20: a `to` outside the range.
	test.each(["2023-10", "2027-12", "2026-13", ""])("refuses to=%j", (to) => {
		expect(
			refused(() =>
				readHistoryQuery(query(`category=food&to=${to}`), CURRENT),
			),
		).toEqual(["to"]);
	});

	test("refuses a missing to", () => {
		expect(
			refused(() => readHistoryQuery(query("category=food"), CURRENT)),
		).toEqual(["to"]);
	});

	test("refuses each repeated parameter", () => {
		expect(
			refused(() =>
				readHistoryQuery(
					query(
						"category=food&category=food&to=2026-11&to=2026-11&months=6&months=6",
					),
					CURRENT,
				),
			),
		).toEqual(["category", "to", "months"]);
	});

	test("names every refused parameter in one 400, in order", () => {
		expect(
			refused(() =>
				readHistoryQuery(
					query("category=salary&to=2030-01&months=0"),
					CURRENT,
				),
			),
		).toEqual(["category", "to", "months"]);
		expect(refused(() => readHistoryQuery(query(""), CURRENT))).toEqual([
			"category",
			"to",
		]);
	});
});

describe("readSummaryQuery (BR-F04-35)", () => {
	test("reads a year that holds a month of the range", () => {
		expect(readSummaryQuery(query("year=2026"), CURRENT)).toBe(2026);
		expect(readSummaryQuery(query("year=2023"), CURRENT)).toBe(2023);
		expect(readSummaryQuery(query("year=2027"), CURRENT)).toBe(2027);
	});

	// AC-F04-21
	test.each(["2022", "2028", "26", "02026", "2026a", "20 26", "", "-2026"])(
		"refuses year=%j",
		(year) => {
			expect(
				refused(() => readSummaryQuery(query(`year=${year}`), CURRENT)),
			).toEqual(["year"]);
		},
	);

	test("refuses a missing or repeated year", () => {
		expect(refused(() => readSummaryQuery(query(""), CURRENT))).toEqual([
			"year",
		]);
		expect(
			refused(() => readSummaryQuery(query("year=2026&year=2026"), CURRENT)),
		).toEqual(["year"]);
	});

	test("moves with the current month: in January 2027 the range starts in 2024", () => {
		expect(
			refused(() => readSummaryQuery(query("year=2023"), "2027-01")),
		).toEqual(["year"]);
		expect(readSummaryQuery(query("year=2028"), "2027-01")).toBe(2028);
	});
});
