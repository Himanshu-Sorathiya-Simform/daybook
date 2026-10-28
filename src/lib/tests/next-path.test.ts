import { describe, expect, test } from "vitest";
import { safeNextPath } from "../next-path";

const ORIGIN = "http://localhost:3000";

describe("accepts a same-origin path", () => {
	test.each([
		["/dashboard", "/dashboard"],
		["/transactions?month=2026-11", "/transactions?month=2026-11"],
		["/settings#security", "/settings#security"],
		["/", "/"],
	])("%s", (next, expected) => {
		expect(safeNextPath(next, ORIGIN)).toBe(expected);
	});

	test("returns the resolved path, so dot segments are collapsed", () => {
		expect(safeNextPath("/a/../dashboard", ORIGIN)).toBe("/dashboard");
	});

	test("keeps an encoded value encoded", () => {
		expect(safeNextPath("/search?q=a%20b", ORIGIN)).toBe("/search?q=a%20b");
	});

	test("works with an https origin", () => {
		expect(safeNextPath("/dashboard", "https://daybook.example")).toBe(
			"/dashboard",
		);
	});
});

describe("ignores", () => {
	test.each([
		["missing", undefined],
		["null", null],
		["empty", ""],
		["a relative path", "dashboard"],
		["a full URL to another site", "https://evil.example/dashboard"],
		["a full URL to this site", "http://localhost:3000/dashboard"],
		["a protocol-relative URL", "//evil.example/dashboard"],
		["a backslash after the slash", "/\\evil.example"],
		["a backslash anywhere", "/dashboard\\x"],
		["a javascript URL", "javascript:alert(1)"],
	])("%s", (_name, next) => {
		expect(safeNextPath(next, ORIGIN)).toBeNull();
	});

	test("a path that resolves to another origin", () => {
		expect(safeNextPath("//localhost:4000/dashboard", ORIGIN)).toBeNull();
	});

	test("a value that is not a valid URL against the origin", () => {
		expect(safeNextPath("/x", "not an origin")).toBeNull();
	});
});
