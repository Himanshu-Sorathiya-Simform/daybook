import { describe, expect, test } from "vitest";

import { pickedId, selectedIn } from "../selection";

describe("pickedId", () => {
	test("is the id of the one key chosen", () => {
		expect(pickedId(new Set(["a1"]))).toBe("a1");
	});

	test("is null for a cleared selection", () => {
		expect(pickedId(new Set())).toBeNull();
	});

	test("reads a number key as its text", () => {
		expect(pickedId(new Set([7]))).toBe("7");
	});
});

describe("selectedIn", () => {
	const ids = ["a", "b", "c"];

	test("holds the selected id when this collection has it", () => {
		expect(selectedIn(ids, "b")).toEqual(["b"]);
	});

	test("is empty when the selection is in another collection", () => {
		expect(selectedIn(ids, "z")).toEqual([]);
	});

	test("is empty with nothing selected", () => {
		expect(selectedIn(ids, null)).toEqual([]);
	});

	test("is empty for no rows", () => {
		expect(selectedIn([], "a")).toEqual([]);
	});
});
