// @vitest-environment node
import { describe, expect, test } from "vitest";

import { readTotals } from "../totals";

/** The SQL fragments run in rollup.integration.test.ts; this covers reading their output. */
describe("readTotals", () => {
	test("reads every figure from text, negatives included (TXN-7)", () => {
		expect(
			readTotals({
				count: "2",
				incomeMinor: "0",
				spendingMinor: "1842000",
				toGoalsMinor: "0",
				netMinor: "-1842000",
			}),
		).toEqual({
			count: 2,
			incomeMinor: 0,
			spendingMinor: 1842000,
			toGoalsMinor: 0,
			netMinor: -1842000,
		});
	});

	test.each([
		"count",
		"incomeMinor",
		"spendingMinor",
		"toGoalsMinor",
		"netMinor",
	] as const)(
		"throws when %s is past Number.MAX_SAFE_INTEGER, instead of rounding (MON-6)",
		(field) => {
			const json = {
				count: "1",
				incomeMinor: "0",
				spendingMinor: "0",
				toGoalsMinor: "0",
				netMinor: "0",
				[field]: "9007199254740993",
			};
			expect(() => readTotals(json)).toThrow(RangeError);
		},
	);

	test("refuses a figure that is not an integer", () => {
		expect(() =>
			readTotals({
				count: "1",
				incomeMinor: "12.5",
				spendingMinor: "0",
				toGoalsMinor: "0",
				netMinor: "0",
			}),
		).toThrow(TypeError);
	});
});
