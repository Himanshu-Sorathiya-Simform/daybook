import { describe, expect, test } from "vitest";

import { CATEGORY_ICONS } from "@/components/data/categoryIcons";
import { CATEGORY_LABELS, type CategoryKey } from "@/lib/categories";

const KEYS = Object.keys(CATEGORY_LABELS) as CategoryKey[];

describe("CATEGORY_ICONS", () => {
	test("has an icon for every category and no extra ones", () => {
		expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...KEYS].sort());
	});

	test.each(KEYS)("%s has a component to draw", (category) => {
		const icon = CATEGORY_ICONS[category];

		expect(["function", "object"]).toContain(typeof icon);
		expect(icon).toBeTruthy();
	});

	test("gives every category its own icon, so colour is never the only signal", () => {
		expect(new Set(Object.values(CATEGORY_ICONS)).size).toBe(KEYS.length);
	});
});
