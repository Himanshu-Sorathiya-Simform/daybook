import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import { type BudgetChange, previewChange } from "@/lib/budgets/preview";
import { BUDGET_MESSAGES } from "@/lib/budgets/schemas";
import { nothingChanges } from "../../lib/dialog";
import type { Formats } from "../../lib/labels";
import { PREVIEW_TEXT } from "../../lib/preview";
import {
	BudgetChangeSummary,
	type BudgetChangeSummaryProps,
} from "../BudgetChangeSummary";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

const FOOD = goldenBudget("food");
const CHANGE: BudgetChange = {
	scope: "from",
	month: "2026-11",
	limitMinor: 700000,
};
const PREVIEW = previewChange({
	rules: FOOD,
	change: CHANGE,
	spending: () => 0,
	current: "2026-11",
});

function setup(props: Partial<BudgetChangeSummaryProps> = {}) {
	return render(
		<BudgetChangeSummary
			category="food"
			scope="onward"
			month="2026-11"
			current="2026-11"
			formats={IN}
			change={CHANGE}
			preview={PREVIEW}
			figures="ready"
			blocked={false}
			unchanged={false}
			{...props}
		/>,
	);
}

describe("BudgetChangeSummary (BR-F04-26, BR-F04-27)", () => {
	test("shows What changes for a change that can be made", () => {
		setup();
		expect(screen.getByText(PREVIEW_TEXT.heading)).toBeVisible();
	});

	test("shows nothing until there is a category and a limit", () => {
		const none = setup({ change: null, preview: null });
		expect(none.container).toBeEmptyDOMElement();
		const noCategory = setup({ category: null });
		expect(noCategory.container.textContent).not.toContain(PREVIEW_TEXT.heading);
	});

	test("a stop that would remove every month says so, and shows no What changes", () => {
		const stop = previewChange({
			rules: FOOD,
			change: { scope: "from", month: "2000-01", limitMinor: null },
			spending: () => 0,
			current: "2026-11",
		});
		setup({ blocked: true, preview: stop });
		expect(
			screen.getByText(BUDGET_MESSAGES.stopRemovesEveryMonth),
		).toBeVisible();
		expect(screen.queryByText(PREVIEW_TEXT.heading)).toBeNull();
	});

	test("a change that would change nothing says Nothing changes", () => {
		setup({ unchanged: true });
		expect(
			screen.getByText(nothingChanges("food", "onward", "2026-11", IN)),
		).toBeVisible();
	});

	test("no message shows for a change that does something", () => {
		setup();
		expect(screen.queryByText(/Nothing changes\./)).toBeNull();
		expect(screen.queryByText(BUDGET_MESSAGES.stopRemovesEveryMonth)).toBeNull();
	});
});
