// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { canonicalJson, requestHash } from "../request-hash";

describe("canonicalJson", () => {
	test("sorts object keys", () => {
		expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
	});

	test("sorts keys at every level, inside arrays too", () => {
		expect(canonicalJson({ z: { y: 1, x: [{ d: 1, c: 2 }] } })).toBe(
			'{"z":{"x":[{"c":2,"d":1}],"y":1}}',
		);
	});

	test("keeps array order", () => {
		expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
	});

	test.each([
		[null, "null"],
		[true, "true"],
		[0, "0"],
		[-12.5, "-12.5"],
		['a"b', '"a\\"b"'],
		["₹ ✓", '"₹ ✓"'],
		[{}, "{}"],
		[[], "[]"],
	])("writes %j as %s", (value, expected) => {
		expect(canonicalJson(value)).toBe(expected);
	});

	test("escapes keys the way JSON does", () => {
		expect(canonicalJson({ 'a"b': 1 })).toBe('{"a\\"b":1}');
	});

	test("gives the same text for the same meaning, whatever the order or spacing", () => {
		const one = JSON.parse(
			'{ "amount": 45000, "payee": "Swiggy", "tags": ["a"] }',
		);
		const two = JSON.parse('{"tags":["a"],"payee":"Swiggy","amount":45000}');
		expect(canonicalJson(one)).toBe(canonicalJson(two));
	});
});

describe("requestHash", () => {
	const url = new URL("http://localhost:3000/api/transactions?dryRun=1");

	test("is SHA-256 of method, path with query and canonical body, one per line", () => {
		const expected = createHash("sha256")
			.update('POST\n/api/transactions?dryRun=1\n{"a":1,"b":2}')
			.digest("hex");
		expect(requestHash("POST", url, { b: 2, a: 1 })).toBe(expected);
	});

	test("is 64 lowercase hex characters, as the table's check requires", () => {
		expect(requestHash("POST", url, {})).toMatch(/^[0-9a-f]{64}$/);
	});

	test("upper-cases the method", () => {
		expect(requestHash("post", url, {})).toBe(requestHash("POST", url, {}));
	});

	test("differs when only the query differs (D-432)", () => {
		const bare = new URL("http://localhost:3000/api/transactions");
		expect(requestHash("POST", url, {})).not.toBe(requestHash("POST", bare, {}));
	});

	test("differs by method, path and body", () => {
		const base = requestHash("POST", url, { a: 1 });
		expect(requestHash("PATCH", url, { a: 1 })).not.toBe(base);
		expect(
			requestHash("POST", new URL("http://localhost:3000/api/x?dryRun=1"), {
				a: 1,
			}),
		).not.toBe(base);
		expect(requestHash("POST", url, { a: 2 })).not.toBe(base);
	});

	test("ignores the origin, so the same request through another host matches", () => {
		const other = new URL("http://127.0.0.1:3000/api/transactions?dryRun=1");
		expect(requestHash("POST", other, {})).toBe(requestHash("POST", url, {}));
	});
});
