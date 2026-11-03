import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	CATEGORY_LABELS,
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
	categoryColor,
	categoryLabel,
	type CategoryKey,
} from "@/lib/categories";

const css = readFileSync(
	join(import.meta.dirname, "../../styles/categories.css"),
	"utf8",
);
const KEYS = Object.keys(CATEGORY_LABELS) as CategoryKey[];

describe("the lists (CAT-2, CAT-3)", () => {
	test("has fifteen expense categories, in order", () => {
		expect([...EXPENSE_CATEGORIES]).toEqual([
			"food",
			"shopping",
			"transportation",
			"utilities",
			"entertainment",
			"housing",
			"health",
			"education",
			"travel",
			"insurance",
			"personal_care",
			"gifts_donations",
			"fees_taxes",
			"loans",
			"other",
		]);
	});

	test("has five income categories, in order", () => {
		expect([...INCOME_CATEGORIES]).toEqual([
			"salary",
			"freelance",
			"investments",
			"gifts",
			"other_income",
		]);
	});

	test("has twenty categories in all, and none in both lists", () => {
		expect(KEYS).toHaveLength(20);
		expect(new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]).size).toBe(20);
		expect(
			EXPENSE_CATEGORIES.filter((key) =>
				(INCOME_CATEGORIES as readonly string[]).includes(key),
			),
		).toEqual([]);
	});

	test("every list entry has a label, and every label is in a list", () => {
		for (const key of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
			expect(CATEGORY_LABELS[key]).toBeTruthy();
		expect([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].sort()).toEqual(
			[...KEYS].sort(),
		);
	});

	test("keys are stable snake_case words (CAT-1)", () => {
		for (const key of KEYS) expect(key).toMatch(/^[a-z]+(_[a-z]+)*$/);
	});
});

describe("labels", () => {
	test.each([
		["food", "Food"],
		["personal_care", "Personal care"],
		["gifts_donations", "Gifts and donations"],
		["fees_taxes", "Fees and taxes"],
		["other", "Other"],
		["other_income", "Other income"],
		["salary", "Salary"],
	] as [CategoryKey, string][])("%s is %j", (key, label) => {
		expect(categoryLabel(key)).toBe(label);
	});

	test("are unique, sentence case and free of underscores", () => {
		const labels = KEYS.map(categoryLabel);

		expect(new Set(labels).size).toBe(20);
		for (const label of labels) {
			expect(label).not.toContain("_");
			expect(label[0]).toBe(label[0]!.toUpperCase());
		}
	});
});

describe("colours", () => {
	test.each([
		["food", "var(--cat-food)"],
		["personal_care", "var(--cat-personal-care)"],
		["gifts_donations", "var(--cat-gifts-donations)"],
		["other_income", "var(--cat-other-income)"],
	] as [CategoryKey, string][])("%s is %s", (key, color) => {
		expect(categoryColor(key)).toBe(color);
	});

	test.each(KEYS)(
		"%s has a colour variable declared for light and dark in the styles",
		(category) => {
			const variable = categoryColor(category).slice(4, -1);
			const declarations = css.split(`${variable}:`).length - 1;

			expect(declarations).toBe(2);
		},
	);

	test("every category has its own colour variable", () => {
		expect(new Set(KEYS.map(categoryColor)).size).toBe(20);
	});

	test("every colour variable also has a Tailwind colour, such as bg-cat-food", () => {
		for (const category of KEYS) {
			const name = category.replaceAll("_", "-");
			expect(css).toContain(`--color-cat-${name}: var(--cat-${name})`);
		}
	});
});
