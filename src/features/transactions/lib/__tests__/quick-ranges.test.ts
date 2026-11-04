import { describe, expect, test } from "vitest";

import { quickRanges } from "../quick-ranges";

/** Check B's histogram (F03 section 5): 380.00, 640.00, 2,300.00 and 2,900.00. */
const CHECK_B = {
	edges: [
		31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
		315000,
	],
	counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
};

describe("quickRanges (BR-F03-74, D-524)", () => {
	// AC-F03-59
	test("check B gives the four ranges of section 5, one row each", () => {
		expect(quickRanges(CHECK_B)).toEqual([
			{ maxMinor: 39999, count: 1 },
			{ minMinor: 40000, maxMinor: 79999, count: 1 },
			{ minMinor: 80000, maxMinor: 249999, count: 1 },
			{ minMinor: 250000, count: 1 },
		]);
	});

	// AC-F03-59
	test("each range's max is 1 minor unit below the next range's min", () => {
		const ranges = quickRanges(CHECK_B);
		for (let i = 0; i + 1 < ranges.length; i++) {
			expect(ranges[i]!.maxMinor! + 1).toBe(ranges[i + 1]!.minMinor);
		}
	});

	// AC-F03-59
	test("three rows give none", () => {
		expect(
			quickRanges({ edges: [31500, 40000, 50000, 63000], counts: [1, 1, 1] }),
		).toEqual([]);
	});

	// AC-F03-59
	test("four rows of 649.00 leave one range, so none show", () => {
		expect(quickRanges({ edges: [63000, 80000], counts: [4] })).toEqual([]);
	});

	test("no rows give none", () => {
		expect(quickRanges({ edges: [], counts: [] })).toEqual([]);
	});

	test("equal quartile edges merge into one", () => {
		// Six rows: the second and third quarters are both reached at the third edge.
		expect(
			quickRanges({ edges: [100, 200, 500, 1000], counts: [2, 3, 1] }),
		).toEqual([
			{ maxMinor: 199, count: 2 },
			{ minMinor: 200, maxMinor: 499, count: 3 },
			{ minMinor: 500, count: 1 },
		]);
	});

	test("a range that holds no rows is dropped, and the rest keep their bounds", () => {
		// Four rows, three in the last bucket: the last quartile edge is the final edge.
		expect(quickRanges({ edges: [100, 200, 500], counts: [1, 3] })).toEqual([
			{ maxMinor: 199, count: 1 },
			{ minMinor: 200, maxMinor: 499, count: 3 },
		]);
	});

	test("a range runs across empty buckets up to the next quartile edge", () => {
		const ranges = quickRanges({
			edges: [100, 200, 500, 1000, 2000, 5000],
			counts: [2, 0, 0, 0, 2],
		});
		expect(ranges).toEqual([
			{ maxMinor: 199, count: 2 },
			// The third quarter is reached only at the final edge, so that range is empty.
			{ minMinor: 200, maxMinor: 4999, count: 2 },
		]);
	});

	test("the counts of the ranges add up to every row", () => {
		const histogram = {
			edges: [1, 2, 5, 10, 20, 50, 100, 200],
			counts: [3, 7, 1, 0, 9, 2, 5],
		};
		const total = histogram.counts.reduce((sum, n) => sum + n, 0);
		const ranges = quickRanges(histogram);
		expect(ranges.reduce((sum, range) => sum + range.count, 0)).toBe(total);
		expect(ranges.length).toBeLessThanOrEqual(4);
	});

	test("reaching a quarter exactly counts, in integers", () => {
		// 8 rows: 2 rows reach a quarter at the second edge, 4 a half at the third.
		expect(
			quickRanges({ edges: [1, 2, 3, 4, 5], counts: [2, 2, 2, 2] }),
		).toEqual([
			{ maxMinor: 1, count: 2 },
			{ minMinor: 2, maxMinor: 2, count: 2 },
			{ minMinor: 3, maxMinor: 3, count: 2 },
			{ minMinor: 4, count: 2 },
		]);
	});

	test("a count just under a quarter waits for the next edge", () => {
		// 9 rows: 4 × 2 = 8 < 9, so the first quartile edge is the third, at 3 rows.
		expect(
			quickRanges({ edges: [1, 2, 3, 4, 5], counts: [2, 1, 3, 3] })[0],
		).toEqual({ maxMinor: 2, count: 3 });
	});
});
