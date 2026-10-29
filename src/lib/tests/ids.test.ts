import { describe, expect, test } from "vitest";

import { isUuid, isUuidV7, uuidV7Time } from "@/lib/ids";

const V7 = "0192f0c4-8a1b-7c2d-9e3f-0123456789ab";

describe("isUuidV7 (ID-1)", () => {
	test("accepts a UUIDv7, in either case", () => {
		expect(isUuidV7(V7)).toBe(true);
		expect(isUuidV7(V7.toUpperCase())).toBe(true);
	});

	test.each(["8", "9", "a", "b"])("accepts the variant nibble %s", (variant) => {
		expect(isUuidV7(`0192f0c4-8a1b-7c2d-${variant}e3f-0123456789ab`)).toBe(true);
	});

	test.each([
		["a UUIDv4", "0192f0c4-8a1b-4c2d-9e3f-0123456789ab"],
		["a bad variant", "0192f0c4-8a1b-7c2d-7e3f-0123456789ab"],
		["no dashes", "0192f0c48a1b7c2d9e3f0123456789ab"],
		["extra text", `${V7}x`],
		["a leading space", ` ${V7}`],
		["a letter outside hexadecimal", "0192f0c4-8a1b-7c2d-9e3f-0123456789ag"],
		["empty", ""],
		["null", null],
		["undefined", undefined],
	])("refuses %s", (_name, value) => {
		expect(isUuidV7(value)).toBe(false);
	});
});

describe("isUuid", () => {
	test.each([
		["a UUIDv7", V7],
		["a UUIDv4", "0192f0c4-8a1b-4c2d-9e3f-0123456789ab"],
		["the nil UUID", "00000000-0000-0000-0000-000000000000"],
		["upper case", V7.toUpperCase()],
	])("accepts %s", (_name, value) => {
		expect(isUuid(value)).toBe(true);
	});

	test.each([
		["no dashes", "0192f0c48a1b7c2d9e3f0123456789ab"],
		["a short group", "0192f0c4-8a1b-7c2d-9e3f-0123456789a"],
		["extra text", `${V7}x`],
		["a letter outside hexadecimal", "0192f0c4-8a1b-7c2d-9e3f-0123456789ag"],
		["empty", ""],
		["null", null],
		["undefined", undefined],
	])("refuses %s", (_name, value) => {
		expect(isUuid(value)).toBe(false);
	});
});

describe("uuidV7Time (BR-P2-20)", () => {
	test("reads the first 48 bits as milliseconds since 1970", () => {
		const at = new Date("2026-11-02T06:30:00.000Z").getTime();
		const hex = at.toString(16).padStart(12, "0");
		const id = `${hex.slice(0, 8)}-${hex.slice(8)}-7abc-8def-0123456789ab`;
		expect(uuidV7Time(id)).toBe(at);
	});

	test("ignores case and the bits after the time", () => {
		expect(uuidV7Time("0199A000-0000-7FFF-BFFF-FFFFFFFFFFFF")).toBe(
			uuidV7Time("0199a000-0000-7000-8000-000000000000"),
		);
	});

	test("is 0 for the smallest time", () => {
		expect(uuidV7Time("00000000-0000-7000-8000-000000000000")).toBe(0);
	});
});
