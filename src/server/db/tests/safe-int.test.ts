// @vitest-environment node
import { describe, expect, test } from "vitest";
import { safeInt } from "../safe-int";

describe("strings from pg (bigint, numeric, count)", () => {
	test("converts a positive integer string", () => {
		expect(safeInt("124050")).toBe(124050);
	});

	test("converts zero", () => {
		expect(safeInt("0")).toBe(0);
	});

	test("converts a negative integer string, such as a net figure below zero", () => {
		expect(safeInt("-1842000")).toBe(-1842000);
	});

	test("reads leading zeros as the same integer", () => {
		expect(safeInt("007")).toBe(7);
	});

	// AC-P2-14
	test("accepts the largest safe integer exactly", () => {
		expect(safeInt("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
	});

	// AC-P2-14
	test("throws one above the largest safe integer instead of rounding", () => {
		expect(() => safeInt("9007199254740992")).toThrow(RangeError);
	});

	test("accepts the smallest safe integer exactly", () => {
		expect(safeInt("-9007199254740991")).toBe(Number.MIN_SAFE_INTEGER);
	});

	test("throws one below the smallest safe integer", () => {
		expect(() => safeInt("-9007199254740992")).toThrow(RangeError);
	});

	test("throws far outside the range, where Number() would silently lose digits", () => {
		expect(() => safeInt("123456789012345678901234567890")).toThrow(RangeError);
	});

	test.each([
		["a decimal", "12.5"],
		["an empty string", ""],
		["surrounding spaces", " 12"],
		["exponent notation", "1e3"],
		["an explicit plus sign", "+5"],
		["letters", "12abc"],
		["a lone minus sign", "-"],
	])("refuses %s", (_label, value) => {
		expect(() => safeInt(value)).toThrow(TypeError);
	});
});

describe("numbers", () => {
	test("passes a safe integer through", () => {
		expect(safeInt(42)).toBe(42);
	});

	test("passes a negative safe integer through", () => {
		expect(safeInt(-42)).toBe(-42);
	});

	test.each([
		["a fraction", 1.5],
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
		["an integer past the safe range", Number.MAX_SAFE_INTEGER + 2],
	])("refuses %s", (_label, value) => {
		expect(() => safeInt(value)).toThrow(RangeError);
	});
});

describe("bigints", () => {
	test("converts a bigint inside the safe range", () => {
		expect(safeInt(BigInt(99_999_999_999))).toBe(99_999_999_999);
	});

	test("throws for a bigint past the safe range", () => {
		expect(() => safeInt(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1))).toThrow(
			RangeError,
		);
	});
});

describe("other values", () => {
	test("refuses null and names it in the message", () => {
		expect(() => safeInt(null)).toThrow("got null");
	});

	test.each([
		["undefined", undefined],
		["a boolean", true],
		["an object", {}],
	])("refuses %s", (_label, value) => {
		expect(() => safeInt(value)).toThrow(TypeError);
	});
});
