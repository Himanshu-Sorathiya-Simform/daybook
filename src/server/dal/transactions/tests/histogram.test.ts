// @vitest-environment node
import { describe, expect, test } from "vitest";

import {
	histogramEdges,
	MAX_BUCKETS,
	mergeBuckets,
	seriesOf,
	STEPS,
} from "../histogram";

/** The histogram's pure parts (BR-F03-60, D-449, D-476); amountHistogram's SQL runs in
 * histogram.integration.test.ts. */

const [FULL, SECOND, THIRD] = STEPS.map(seriesOf) as [number[], number[], number[]];

describe("seriesOf", () => {
	// BR-F03-60: "So the series runs 1, 2, 4, 5, 8, 10, 16, 20 and on."
	test("the full series keeps only whole minor units below 100", () => {
		expect(FULL.slice(0, 16)).toEqual([
			1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 63, 80, 100, 125, 160,
		]);
	});

	test("the thinner series start 1, 4, 10, 16 and 1, 2, 5, 10", () => {
		expect(SECOND.slice(0, 8)).toEqual([1, 4, 10, 16, 25, 40, 63, 100]);
		expect(THIRD.slice(0, 7)).toEqual([1, 2, 5, 10, 20, 50, 100]);
	});

	test.each([
		["full", FULL],
		["second", SECOND],
		["third", THIRD],
	])("the %s series rises strictly, in integers, to 10^12", (_name, series) => {
		expect(series.every(Number.isSafeInteger)).toBe(true);
		expect(series.every((value, i) => i === 0 || value > series[i - 1]!)).toBe(
			true,
		);
		expect(series.at(-1)).toBe(1_000_000_000_000);
	});

	test("each thinner series is a subset of the finer one, so buckets merge exactly", () => {
		expect(SECOND.every((value) => FULL.includes(value))).toBe(true);
		expect(THIRD.every((value) => FULL.includes(value))).toBe(true);
	});

	test("a whole decade of the full series holds its ten steps", () => {
		expect(FULL.filter((value) => value >= 100000 && value < 1000000)).toEqual([
			100000, 125000, 160000, 200000, 250000, 315000, 400000, 500000, 630000,
			800000,
		]);
	});
});

describe("histogramEdges", () => {
	// golden: section 5, check B's amounts are 380.00, 640.00, 2,300.00 and 2,900.00.
	test("check B runs from 315.00 to 3,150.00 on the full series", () => {
		expect(histogramEdges(38000, 290000)).toEqual([
			31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000,
			250000, 315000,
		]);
	});

	// AC-F03-42
	test("1 and 99,999,999,999 thin twice: 34 edges from 1 to 10^11 in steps 1, 2, 5", () => {
		const edges = histogramEdges(1, 99999999999);
		expect(edges).toHaveLength(34);
		expect(edges.slice(0, 7)).toEqual([1, 2, 5, 10, 20, 50, 100]);
		expect(edges.slice(-4)).toEqual([
			10000000000, 20000000000, 50000000000, 100000000000,
		]);
		// golden: section 5, the full series would give 103 buckets and the second 52.
		expect(FULL.slice(0, FULL.indexOf(100000000000) + 1)).toHaveLength(104);
		expect(SECOND.slice(0, SECOND.indexOf(100000000000) + 1)).toHaveLength(53);
	});

	// AC-F03-42
	test.each([
		[100, [100, 125]],
		[125, [125, 160]],
		[64000, [63000, 80000]],
		[1, [1, 2]],
	])(
		"an amount equal to or inside a bucket, %i, starts at the edge at or below it",
		(amount, edges) => {
			expect(histogramEdges(amount, amount)).toEqual(edges);
		},
	);

	test("the largest KWD amount ends at 10^12", () => {
		expect(histogramEdges(999999999999, 999999999999)).toEqual([
			800000000000, 1000000000000,
		]);
	});

	test(`exactly ${MAX_BUCKETS} buckets keep the full series`, () => {
		// 1.00 to 9,999.99: four decades of ten steps, and 10,000.00 to close.
		const edges = histogramEdges(100, 999999);
		expect(edges).toHaveLength(41);
		expect(edges.slice(0, 3)).toEqual([100, 125, 160]);
	});

	test(`${MAX_BUCKETS + 1} buckets thin to the second series`, () => {
		// 80 minor units adds one more edge below 1.00.
		const edges = histogramEdges(80, 999999);
		expect(edges.slice(0, 4)).toEqual([63, 100, 160, 250]);
		expect(edges.at(-1)).toBe(1000000);
		expect(edges.length - 1).toBeLessThanOrEqual(MAX_BUCKETS);
	});

	test("thins to the third series only when the second is still too long", () => {
		// 1 to 999,999: 53 buckets on the full series, 27 on the second.
		const edges = histogramEdges(1, 999999);
		expect(edges.slice(0, 8)).toEqual([1, 4, 10, 16, 25, 40, 63, 100]);
		expect(edges).toHaveLength(28);
	});
});

describe("mergeBuckets", () => {
	test("no fine buckets give two empty arrays", () => {
		expect(mergeBuckets(new Map())).toEqual({ edges: [], counts: [] });
	});

	// golden: section 5, check B's counts are 1, 0, 0, 1, 0, 0, 0, 0, 1, 1.
	test("check B: each amount's fine bucket lands in its edge's bucket", () => {
		const fine = new Map([
			[31500, 1],
			[63000, 1],
			[200000, 1],
			[250000, 1],
		]);
		expect(mergeBuckets(fine)).toEqual({
			edges: [
				31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000,
				250000, 315000,
			],
			counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
		});
	});

	test("one fine bucket gives one bucket", () => {
		expect(mergeBuckets(new Map([[63000, 3]]))).toEqual({
			edges: [63000, 80000],
			counts: [3],
		});
	});

	test("after thinning, several fine buckets add into one", () => {
		// Fine buckets [1, 2), [2, 4), [4, 5) and the one holding 99,999,999,999.
		const { edges, counts } = mergeBuckets(
			new Map([
				[1, 3],
				[2, 1],
				[4, 2],
				[80000000000, 1],
			]),
		);
		expect(edges).toHaveLength(34);
		// [1, 2) holds 3; [2, 5) holds the fine [2, 4) and [4, 5): 1 + 2.
		expect(counts.slice(0, 3)).toEqual([3, 3, 0]);
		expect(counts.at(-1)).toBe(1);
		expect(counts.reduce((sum, count) => sum + count, 0)).toBe(7);
	});
});
