import { render, screen, within } from "@testing-library/react";
import { GridList as AriaGridList } from "react-aria-components";
import { describe, expect, test } from "vitest";

import type { Formats } from "../../lib/labels";
import { monthAnswer } from "../../lib/__tests__/fixtures";
import { BudgetListItem, type BudgetListItemProps } from "../BudgetListItem";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const OCTOBER = monthAnswer("2026-10");
const rowFor = (category: string) =>
	OCTOBER.budgets.find((each) => each.category === category)!;

function renderItem(props: Partial<BudgetListItemProps> = {}) {
	return render(
		<AriaGridList aria-label="Budgets">
			<BudgetListItem
				row={rowFor("food")}
				formats={IN}
				{...props}
			/>
		</AriaGridList>,
	);
}

describe("BudgetListItem (BR-F04-16)", () => {
	test("a row with its category's id", () => {
		renderItem();
		expect(screen.getByRole("row")).toHaveAttribute("data-key", "budget:food");
	});

	test("named by its whole reading", () => {
		renderItem();
		expect(screen.getByRole("row")).toHaveAccessibleName(
			"Food, Over by ₹1,220.00, ₹6,220.00 of ₹5,000.00 · 124.4% · Over budget, ₹5,000.00 from Oct 2026",
		);
	});

	test("shows the category, the headline, the bar, the figures and the source", () => {
		renderItem();
		const row = screen.getByRole("row");
		expect(within(row).getByText("Food")).toBeVisible();
		expect(within(row).getByText("Over by ₹1,220.00")).toHaveClass("text-neg");
		expect(row.querySelector('[data-part="over"]')).not.toBeNull();
		expect(row).toHaveTextContent(
			"₹6,220.00 of ₹5,000.00 · 124.4% · Over budget",
		);
		expect(within(row).getByText("Over budget")).toHaveClass("text-neg");
		expect(within(row).getByText("₹5,000.00 from Oct 2026")).toHaveClass(
			"text-ink-3",
		);
	});

	test("Nearing limit's headline and state take the warning colour", () => {
		renderItem({ row: rowFor("transportation") });
		expect(screen.getByText("₹200.00 left")).toHaveClass("text-warn");
		expect(screen.getByText("Nearing limit")).toHaveClass("text-warn");
	});

	test("an On track headline stays plain", () => {
		const september = monthAnswer("2026-09").budgets.find(
			(each) => each.category === "entertainment",
		)!;
		renderItem({ row: september });
		expect(screen.getByText("₹351.00 left")).toHaveClass("text-ink");
	});

	test("today's marker only when given", () => {
		const { unmount } = renderItem();
		expect(
			screen.getByRole("row").querySelector('[data-part="today"]'),
		).toBeNull();
		unmount();
		renderItem({ todayShare: 0.5 });
		expect(
			screen.getByRole("row").querySelector('[data-part="today"]'),
		).not.toBeNull();
	});

	test("hover, selection and focus look, and the caller's classes", () => {
		renderItem({ className: "mt-1" });
		expect(screen.getByRole("row")).toHaveClass(
			"hover:bg-soft",
			"selected:bg-accent-soft",
			"focus-visible:focus-ring",
			"mt-1",
		);
	});
});
