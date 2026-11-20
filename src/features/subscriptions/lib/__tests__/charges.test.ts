import { describe, expect, test } from "vitest";

import { chargeCell, lastThrough, linkedCharges } from "../charges";
import { charge } from "./fixtures";

const FORMATS = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
} as const;

const on = (dueOn: string | null, over: Parameters<typeof charge>[0] = {}) =>
	charge({ dueOn, occurredOn: dueOn ?? "2026-10-01", ...over });

describe("the linked charges of a Subscription (BR-F05-48)", () => {
	test("keeps those with a due date, oldest first", () => {
		const found = linkedCharges([on("2026-10-05"), on(null), on("2026-09-05")]);
		expect(found.map((each) => each.dueOn)).toEqual([
			"2026-09-05",
			"2026-10-05",
		]);
	});

	test("an empty read has none", () => {
		expect(linkedCharges([])).toEqual([]);
	});

	test("does not change the list it was given", () => {
		const given = [on("2026-10-05"), on("2026-09-05")];
		linkedCharges(given);
		expect(given.map((each) => each.dueOn)).toEqual([
			"2026-10-05",
			"2026-09-05",
		]);
	});
});

describe("the latest charge through a date", () => {
	const all = linkedCharges([on("2026-09-05"), on("2026-10-05")]);

	test("is the newest on or before it", () => {
		expect(lastThrough(all, "2026-11-02")?.dueOn).toBe("2026-10-05");
	});

	test("includes a charge due on the date itself", () => {
		expect(lastThrough(all, "2026-10-05")?.dueOn).toBe("2026-10-05");
	});

	test("skips a charge due after it", () => {
		expect(lastThrough(all, "2026-10-04")?.dueOn).toBe("2026-09-05");
	});

	test("is null when none is that early", () => {
		expect(lastThrough(all, "2026-09-04")).toBeNull();
		expect(lastThrough([], "2026-11-02")).toBeNull();
	});
});

describe("a charge as a cell of a strip", () => {
	const found = linkedCharges([on("2026-10-05")])[0]!;

	test("shows its date and amount, with no note unless given", () => {
		expect(chargeCell(found, "kept", FORMATS)).toEqual({
			kind: "kept",
			label: "5 Oct",
			amount: "₹649.00",
		});
	});

	test("carries a note", () => {
		expect(chargeCell(found, "off", FORMATS, "deleted")).toMatchObject({
			kind: "off",
			note: "deleted",
		});
	});

	test("carries a warning only when asked", () => {
		expect(chargeCell(found, "off", FORMATS, "deleted", true)).toMatchObject({
			warn: true,
		});
		expect(chargeCell(found, "off", FORMATS, "deleted")).not.toHaveProperty(
			"warn",
		);
	});

	test("writes the year outside the current one", () => {
		const later = linkedCharges([on("2027-01-05")])[0]!;
		expect(chargeCell(later, "kept", FORMATS).label).toBe("5 Jan 2027");
	});
});
