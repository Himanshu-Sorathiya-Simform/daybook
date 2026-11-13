import { describe, expect, test } from "vitest";

import { BUDGETS_TEXT, budgetExistsMessage } from "../messages";

describe("the page's own messages (F04 section 8)", () => {
	test("each reads as section 8 writes it", () => {
		expect(BUDGETS_TEXT).toEqual({
			saveFailed:
				"The Budget could not be saved. Check your connection and try again. Your changes are still here.",
			deleteFailed:
				"The Budget could not be deleted. Check your connection and try again.",
			noticeFailed:
				"The Budget could not be saved. Check your connection and try again.",
			deletedElsewhere: "This Budget was deleted on another device.",
		});
	});

	test.each([
		[
			"Shopping",
			"A Shopping Budget already exists. We opened it so you can change it.",
		],
		[
			"Health",
			"A Health Budget already exists. We opened it so you can change it.",
		],
		[
			"Personal care",
			"A Personal care Budget already exists. We opened it so you can change it.",
		],
	])("budget_exists names the category: %s", (label, text) => {
		expect(budgetExistsMessage(label)).toBe(text);
	});
});
