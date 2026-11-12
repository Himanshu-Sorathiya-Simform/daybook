import { describe, expect, test } from "vitest";

import { boundsOf, thumbsOf } from "../amount-stops";

/** Check B's edges (F03 section 5), in minor units. */
const EDGES = [
	31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
	315000,
];
const LAST = EDGES.length - 1;

describe("boundsOf (BR-F03-39)", () => {
	test("thumbs at both ends write no bounds", () => {
		expect(boundsOf(EDGES, [0, LAST])).toEqual({});
	});

	test("the lower thumb writes its edge as min", () => {
		expect(boundsOf(EDGES, [1, LAST])).toEqual({ minMinor: 40000 });
	});

	test("the upper thumb writes 1 minor unit below its edge as max", () => {
		expect(boundsOf(EDGES, [0, 4])).toEqual({ maxMinor: 79999 });
	});

	test("both thumbs inside write both bounds", () => {
		expect(boundsOf(EDGES, [4, 9])).toEqual({
			minMinor: 80000,
			maxMinor: 249999,
		});
	});

	test("the upper thumb one edge below the last writes that edge minus 1", () => {
		expect(boundsOf(EDGES, [0, LAST - 1])).toEqual({ maxMinor: 249999 });
	});
});

describe("thumbsOf (BR-F03-39)", () => {
	test("no bounds put the thumbs at both ends", () => {
		expect(thumbsOf(EDGES, {})).toEqual([0, LAST]);
	});

	test("a min on an edge puts the lower thumb on it", () => {
		expect(thumbsOf(EDGES, { minMinor: 80000 })).toEqual([4, LAST]);
	});

	test("a max 1 below an edge puts the upper thumb on that edge", () => {
		expect(thumbsOf(EDGES, { maxMinor: 79999 })).toEqual([0, 4]);
	});

	test("every quick range of check B maps back to its own edges", () => {
		for (const thumbs of [
			[0, 1],
			[1, 4],
			[4, 9],
			[9, LAST],
		] as const) {
			expect(thumbsOf(EDGES, boundsOf(EDGES, thumbs))).toEqual(thumbs);
		}
	});

	test("a typed min between edges takes the edge below it", () => {
		expect(thumbsOf(EDGES, { minMinor: 70000 })).toEqual([3, LAST]);
	});

	test("a typed max between edges takes the edge above it", () => {
		expect(thumbsOf(EDGES, { maxMinor: 70000 })).toEqual([0, 4]);
	});

	test("a max exactly on an edge takes the next edge, since max is inclusive", () => {
		expect(thumbsOf(EDGES, { maxMinor: 80000 })).toEqual([0, 5]);
	});

	test("a min below every amount keeps the lower thumb at the start", () => {
		expect(thumbsOf(EDGES, { minMinor: 100 })).toEqual([0, LAST]);
	});

	test("a min above every amount stops the lower thumb one edge before the end", () => {
		expect(thumbsOf(EDGES, { minMinor: 9_000_000 })).toEqual([LAST - 1, LAST]);
	});

	test("a max above every amount keeps the upper thumb at the end", () => {
		expect(thumbsOf(EDGES, { maxMinor: 9_000_000 })).toEqual([0, LAST]);
	});

	test("a max below every amount puts the upper thumb on the second edge", () => {
		expect(thumbsOf(EDGES, { maxMinor: 100 })).toEqual([0, 1]);
	});

	test("bounds inside one bucket keep the thumbs one edge apart", () => {
		expect(thumbsOf(EDGES, { minMinor: 64000, maxMinor: 65000 })).toEqual([
			3, 4,
		]);
	});

	test("a min above the max still keeps the thumbs one edge apart", () => {
		expect(thumbsOf(EDGES, { minMinor: 200000, maxMinor: 50000 })).toEqual([
			8, 9,
		]);
	});

	test("two edges give the two ends", () => {
		expect(
			thumbsOf([63000, 80000], { minMinor: 64900, maxMinor: 64900 }),
		).toEqual([0, 1]);
	});
});
