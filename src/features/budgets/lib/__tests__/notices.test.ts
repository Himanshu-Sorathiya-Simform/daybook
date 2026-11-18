import { describe, expect, test } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { MonthLimit, ScheduleEntry } from "@/lib/budgets/model";
import type { Formats } from "../labels";
import { deletionNotice, removalNotice, rulesOf, writeNotice } from "../notices";
import { budgetAnswer } from "./fixtures";

// Texts are BR-F04-29's, with figures from F04 section 5.

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const DE: Formats = { currency: "EUR", numberLocale: "de-DE", dateLocale: "de-DE" };

const FOOD = goldenBudget("food");
const SAVED = budgetAnswer("food", { version: 3 });

describe("writeNotice's words (BR-F04-29)", () => {
	test.each([
		[
			"a new Budget",
			{ scope: "onward", month: "2026-11", limitMinor: 300000, before: null },
			"Food Budget added: ₹3,000.00 from November 2026.",
		],
		[
			"a change from a month onward",
			{ scope: "onward", month: "2026-09", limitMinor: 700000, before: FOOD },
			"Food limit is now ₹7,000.00 from September 2026.",
		],
		[
			"a one-month limit",
			{ scope: "month", month: "2026-10", limitMinor: 800000, before: FOOD },
			"Food limit is ₹8,000.00 for October 2026 only.",
		],
		[
			"a stop from a month onward",
			{ scope: "onward", month: "2026-11", limitMinor: null, before: FOOD },
			"Food Budget stops from November 2026. Earlier months keep their limits.",
		],
		[
			"a stop for one month",
			{ scope: "month", month: "2026-10", limitMinor: null, before: FOOD },
			"Food has no limit for October 2026 only.",
		],
		[
			"an Add for a category with a record is a change",
			{ scope: "onward", month: "2026-12", limitMinor: 400000, before: FOOD },
			"Food limit is now ₹4,000.00 from December 2026.",
		],
		[
			"an Add for one month on a record",
			{ scope: "month", month: "2026-12", limitMinor: 400000, before: FOOD },
			"Food limit is ₹4,000.00 for December 2026 only.",
		],
	] as const)("%s", (_, input, text) => {
		expect(writeNotice({ ...input, saved: SAVED, formats: IN }).text).toBe(text);
	});

	test("names the category of the saved Budget", () => {
		const entertainment = budgetAnswer("entertainment", { version: 2 });
		const notice = writeNotice({
			scope: "onward",
			month: "2026-11",
			limitMinor: null,
			before: goldenBudget("entertainment"),
			saved: entertainment,
			formats: IN,
		});
		expect(notice.category).toBe("entertainment");
		expect(notice.text).toBe(
			"Entertainment Budget stops from November 2026. Earlier months keep their limits.",
		);
	});

	test("writes figures and months in the profile's language", () => {
		const notice = writeNotice({
			scope: "onward",
			month: "2026-11",
			limitMinor: 700000,
			before: FOOD,
			saved: SAVED,
			formats: DE,
		});
		expect(notice.text.replaceAll(" ", " ")).toBe(
			"Food limit is now 7.000,00 € from November 2026.",
		);
	});

	test("a year always shows", () => {
		const notice = writeNotice({
			scope: "onward",
			month: "2027-01",
			limitMinor: 100,
			before: FOOD,
			saved: SAVED,
			formats: IN,
		});
		expect(notice.text).toBe("Food limit is now ₹1.00 from January 2027.");
	});
});

describe("writeNotice's Undo (BR-F04-29)", () => {
	test("after a create, Undo deletes at the version the create returned", () => {
		const notice = writeNotice({
			scope: "onward",
			month: "2026-11",
			limitMinor: 300000,
			before: null,
			saved: budgetAnswer("food", { id: "new-id", version: 1 }),
			formats: IN,
		});
		expect(notice.undo).toEqual({
			kind: "delete",
			id: "new-id",
			version: 1,
			rules: {
				schedule: [
					{ from: "2026-09", limitMinor: 600000 },
					{ from: "2026-10", limitMinor: 500000 },
				],
				overrides: [],
			},
		});
	});

	test("after a change, Undo restores the rules from before it at the returned version", () => {
		const notice = writeNotice({
			scope: "onward",
			month: "2026-09",
			limitMinor: 700000,
			before: FOOD,
			saved: SAVED,
			formats: IN,
		});
		expect(notice.undo).toEqual({
			kind: "restore",
			id: SAVED.id,
			version: 3,
			rules: {
				schedule: [
					{ from: "2026-09", limitMinor: 600000 },
					{ from: "2026-10", limitMinor: 500000 },
				],
				overrides: [],
			},
		});
	});

	test("the restored rules are a copy: later changes to the Budget do not reach them", () => {
		const before: { schedule: ScheduleEntry[]; overrides: MonthLimit[] } = {
			schedule: FOOD.schedule.map((entry) => ({ ...entry })),
			overrides: [],
		};
		const notice = writeNotice({
			scope: "month",
			month: "2026-10",
			limitMinor: 1,
			before,
			saved: SAVED,
			formats: IN,
		});
		before.schedule.push({ from: "2030-01", limitMinor: 9 });
		before.overrides.push({ month: "2030-02", limitMinor: 9 });
		const { undo } = notice;
		if (undo.kind !== "restore") throw new Error("Expected a restoring Undo.");
		expect(undo.rules.schedule).toHaveLength(2);
		expect(undo.rules.overrides).toHaveLength(0);
	});

	test("a notice of a write may show in the panel", () => {
		expect(
			writeNotice({
				scope: "onward",
				month: "2026-11",
				limitMinor: 1,
				before: null,
				saved: SAVED,
				formats: IN,
			}).inPanel,
		).toBe(true);
	});
});

describe("removalNotice (BR-F04-29)", () => {
	const before = {
		schedule: FOOD.schedule,
		overrides: [{ month: "2026-10", limitMinor: 800000 }],
	};

	test("reads One-month limit for October 2026 removed.", () => {
		const notice = removalNotice({
			month: "2026-10",
			before,
			saved: SAVED,
			formats: IN,
		});
		expect(notice.text).toBe("One-month limit for October 2026 removed.");
		expect(notice.category).toBe("food");
		expect(notice.inPanel).toBe(true);
	});

	test("Undo restores the rules from before, one-month limit included", () => {
		expect(
			removalNotice({ month: "2026-10", before, saved: SAVED, formats: IN })
				.undo,
		).toEqual({
			kind: "restore",
			id: SAVED.id,
			version: 3,
			rules: {
				schedule: FOOD.schedule,
				overrides: [{ month: "2026-10", limitMinor: 800000 }],
			},
		});
	});
});

describe("deletionNotice (BR-F04-29)", () => {
	test("reads Food Budget deleted., never shown in the panel", () => {
		const notice = deletionNotice("food", FOOD);
		expect(notice.text).toBe("Food Budget deleted.");
		expect(notice.inPanel).toBe(false);
		expect(notice.category).toBe("food");
	});

	test("Undo creates the Budget again from its rules", () => {
		expect(
			deletionNotice("food", {
				schedule: FOOD.schedule,
				overrides: [{ month: "2026-12", limitMinor: null }],
			}).undo,
		).toEqual({
			kind: "recreate",
			category: "food",
			rules: {
				schedule: FOOD.schedule,
				overrides: [{ month: "2026-12", limitMinor: null }],
			},
		});
	});

	test("names a two-word category", () => {
		expect(deletionNotice("personal_care", FOOD).text).toBe(
			"Personal care Budget deleted.",
		);
	});
});

describe("rulesOf", () => {
	test("keeps only the schedule and one-month limits, as plain entries", () => {
		const rules = rulesOf({
			...FOOD,
			schedule: [{ from: "2026-09", limitMinor: 1, extra: true } as never],
			overrides: [
				{ month: "2026-10", limitMinor: null, extra: true } as never,
			],
		});
		expect(rules).toEqual({
			schedule: [{ from: "2026-09", limitMinor: 1 }],
			overrides: [{ month: "2026-10", limitMinor: null }],
		});
	});
});
