import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { BudgetChange } from "@/lib/budgets/preview";
import { goldenPreview } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import type { PreviewContext } from "../../lib/preview";
import { PreviewCards, type PreviewCardsProps } from "../PreviewCards";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const FOOD: PreviewContext = { category: "food", current: "2026-11", formats: IN };

const RETRO: BudgetChange = { scope: "from", month: "2026-09", limitMinor: 700000 };
const ONE: BudgetChange = { scope: "month", month: "2026-10", limitMinor: 800000 };

function renderCards(change: BudgetChange, props: Partial<PreviewCardsProps> = {}) {
	return render(
		<PreviewCards
			preview={goldenPreview("food", change)}
			change={change}
			context={FOOD}
			figures="ready"
			{...props}
		/>,
	);
}

const cards = () => screen.getAllByRole("listitem");

describe("a change from a month onward (BR-F04-26)", () => {
	// F04 section 5, a retroactive change: three cards and Dec 2026 onward.
	test("is a card per month, then a card Dec 2026 onward", () => {
		renderCards(RETRO);
		expect(cards()).toHaveLength(4);
		expect(cards()[0]).toHaveTextContent("Sept 2026");
		expect(cards()[1]).toHaveTextContent("Oct 2026");
		expect(cards()[2]).toHaveTextContent("Nov 2026");
		expect(cards()[3]).toHaveTextContent("Dec 2026 onward");
		expect(cards()[3]).toHaveTextContent("₹7,000.00");
		expect(cards()[3]).toHaveTextContent("Carries on until you change it");
	});

	test("the month cards say their old and new figures", () => {
		renderCards(RETRO);
		expect(cards()[0]).toHaveTextContent(
			"84.2% Nearing limit → 72.1% · On track",
		);
		expect(cards()[1]).toHaveTextContent(
			"124.4% Over budget → 88.9% · Nearing limit",
		);
		expect(cards()[2]).toHaveTextContent("6.0% · On track");
	});

	test("the tail card is dashed", () => {
		renderCards(RETRO);
		expect(cards()[3]).toHaveClass("border-dashed");
	});

	test("a change that stops names No Budget in the tail", () => {
		const stop: BudgetChange = {
			scope: "from",
			month: "2026-11",
			limitMinor: null,
		};
		render(
			<PreviewCards
				preview={goldenPreview("entertainment", stop)}
				change={stop}
				context={{ ...FOOD, category: "entertainment" }}
				figures="ready"
			/>,
		);
		const items = cards();
		expect(items).toHaveLength(2);
		expect(items[0]).toHaveTextContent("Nov 2026");
		expect(items[0]).toHaveTextContent("Now No Budget");
		expect(items[1]).toHaveTextContent("Dec 2026 onward");
		expect(items[1]).toHaveTextContent("No Budget");
	});

	test("a later month is a card of its own and its tail", () => {
		const later: BudgetChange = {
			scope: "from",
			month: "2027-02",
			limitMinor: 600000,
		};
		render(
			<PreviewCards
				preview={goldenPreview("food", later)}
				change={later}
				context={FOOD}
				figures="ready"
			/>,
		);
		expect(cards()).toHaveLength(2);
		expect(cards()[0]).toHaveTextContent("Feb 2027");
		expect(cards()[0]).toHaveTextContent("Nothing spent yet");
		expect(cards()[1]).toHaveTextContent("Mar 2027 onward");
	});
});

describe("one month only (BR-F04-26)", () => {
	test("is the month before, the month and the month after, with no tail", () => {
		renderCards(ONE);
		expect(cards()).toHaveLength(3);
		expect(screen.queryByText(/onward/)).not.toBeInTheDocument();
	});

	test("the changed month is solid and the others dashed", () => {
		renderCards(ONE);
		expect(cards()[0]).toHaveClass("border-dashed");
		expect(cards()[1]).not.toHaveClass("border-dashed");
		expect(cards()[2]).toHaveClass("border-dashed");
	});

	test("the neighbours read Unchanged and Back to the schedule", () => {
		renderCards(ONE);
		expect(within(cards()[0]!).getByText("Unchanged")).toBeVisible();
		expect(within(cards()[2]!).getByText("Back to the schedule")).toBeVisible();
		expect(cards()[1]).toHaveTextContent(
			"124.4% Over budget → 77.8% · On track",
		);
	});
});

describe("the figures", () => {
	test("pass to each card: missing spending shows limits alone, tail included", () => {
		renderCards(RETRO, { figures: "missing" });
		expect(screen.queryByText(/On track/)).not.toBeInTheDocument();
		expect(cards()[3]).toHaveTextContent("₹7,000.00");
	});
});

describe("PreviewCards' root", () => {
	test("is a list that takes a className", () => {
		renderCards(RETRO, { className: "extra" });
		expect(screen.getByRole("list")).toHaveClass("extra");
	});
});
