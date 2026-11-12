// @vitest-environment node
import { describe, expect, test } from "vitest";

import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { monthsBefore, todayIn } from "@/lib/time";
import { STRESS_PAYEES, stressRows } from "../stress";

// The golden clock's day (TST-3); the generator only anchors its dates to it.
const TODAY = "2026-11-02";
const rows = stressRows({ today: TODAY });

describe("stressRows (AC-F03-22, AC-F03-25)", () => {
	test("gives 1,000 rows by default, and the count asked for", () => {
		expect(rows).toHaveLength(1000);
		expect(stressRows({ today: TODAY, count: 120 })).toHaveLength(120);
	});

	test("the same seed gives the same rows, and another seed others", () => {
		expect(stressRows({ today: TODAY })).toEqual(rows);
		expect(stressRows({ today: TODAY, seed: 1 })).toEqual(rows);
		expect(stressRows({ today: TODAY, seed: 2 })).not.toEqual(rows);
	});

	test("the first row is the only one on today, so it is the newest", () => {
		expect(rows[0]).toMatchObject({
			payee: "Stress Newest",
			occurredOn: TODAY,
			occurredAt: `${TODAY}T00:00:00.000Z`,
			amountMinor: 42000,
		});
		expect(rows.slice(1).every((row) => row.occurredOn < TODAY)).toBe(true);
	});

	test("every date lies in the 13 months ending on today, and every month has rows", () => {
		const first = monthsBefore(TODAY, 13);
		expect(rows.every((row) => row.occurredOn >= first)).toBe(true);
		const months = new Set(rows.map((row) => row.occurredOn.slice(0, 7)));
		// From October 2025 to November 2026: the oldest month too, so the rows reach back 13.
		expect(months.size).toBeGreaterThanOrEqual(13);
		expect(months.has(first.slice(0, 7))).toBe(true);
	});

	test("each occurredOn is its occurredAt's day in India, in whole minutes", () => {
		for (const row of rows) {
			expect(todayIn("Asia/Kolkata", new Date(row.occurredAt))).toBe(
				row.occurredOn,
			);
			expect(new Date(row.occurredAt).getUTCSeconds()).toBe(0);
			expect(row.createdAt).toBe(row.occurredAt);
		}
	});

	test("each row's category fits its kind, as the table's foreign key needs", () => {
		for (const row of rows) {
			const categories: readonly string[] =
				row.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
			expect(categories).toContain(row.category);
		}
	});

	test("amounts are whole minor units within each payee's range, and never 0", () => {
		const ranges = new Map(
			STRESS_PAYEES.map(([payee, , kind, min, max]) => [
				`${payee}:${kind}`,
				[min, max],
			]),
		);
		for (const row of rows.slice(1)) {
			const [min, max] = ranges.get(`${row.payee}:${row.type}`)!;
			expect(Number.isInteger(row.amountMinor)).toBe(true);
			expect(row.amountMinor).toBeGreaterThanOrEqual(Math.max(1, min!));
			expect(row.amountMinor).toBeLessThanOrEqual(max!);
		}
	});

	test("has expenses, refunds and income, from about 40 payees", () => {
		const kinds = new Set(rows.map((row) => row.type));
		expect([...kinds].sort()).toEqual(["expense", "income", "refund"]);
		const payees = new Set(rows.map((row) => row.payee));
		expect(payees.size).toBeGreaterThanOrEqual(35);
		expect(
			[...payees].every((payee) => payee!.length >= 1 && payee!.length <= 80),
		).toBe(true);
	});

	test("ids are unique and end in the row number, as manual rows", () => {
		expect(new Set(rows.map((row) => row.id)).size).toBe(1000);
		expect(rows[999]!.id.endsWith("0000000003e7")).toBe(true);
		expect(
			rows.every(
				(row) => row.source === "manual" && !row.demo && row.version === 1,
			),
		).toBe(true);
	});

	test("anchors to the day it is given", () => {
		const later = stressRows({ today: "2027-03-01" });
		expect(later[0]!.occurredOn).toBe("2027-03-01");
		expect(later.every((row) => row.occurredOn >= "2026-02-01")).toBe(true);
	});
});
