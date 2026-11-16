import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { setMonth } from "@/lib/budgets/model";
import type { BudgetChange } from "@/lib/budgets/preview";
import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import { goldenPreview } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import type { PreviewContext } from "../../lib/preview";
import { PreviewCard, type PreviewCardProps } from "../PreviewCard";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const DE: Formats = { currency: "EUR", numberLocale: "de-DE", dateLocale: "de-DE" };
const FOOD: PreviewContext = { category: "food", current: "2026-11", formats: IN };

const RETRO: BudgetChange = { scope: "from", month: "2026-09", limitMinor: 700000 };
const ONE: BudgetChange = { scope: "month", month: "2026-10", limitMinor: 800000 };

/** One listed month of a golden food change, as a card. */
function renderCard(
	change: BudgetChange,
	at: number,
	props: Partial<PreviewCardProps> = {},
) {
	const preview = goldenPreview("food", change);
	return render(
		<ul>
			<PreviewCard
				month={preview.months[at]!}
				change={change}
				context={FOOD}
				figures="ready"
				{...props}
			/>
		</ul>,
	);
}

const card = () => screen.getByRole("listitem");

describe("a changed month (BR-F04-26)", () => {
	// F04 section 5, a retroactive change: September.
	test("shows the month, the old limit struck through, the new one and the state", () => {
		renderCard(RETRO, 0);
		expect(card()).toHaveTextContent("Sept 2026");
		const old = screen.getByText("₹6,000.00");
		expect(old.tagName).toBe("S");
		expect(card()).toHaveTextContent("Was ₹6,000.00");
		expect(card()).toHaveTextContent("Now ₹7,000.00");
		expect(card()).toHaveTextContent("84.2% Nearing limit → 72.1% · On track");
	});

	test("a changed state is bold, in the new state's colour", () => {
		renderCard(RETRO, 1);
		const state = screen.getByText("88.9% · Nearing limit");
		expect(state).toHaveClass("font-semibold", "text-warn");
		expect(screen.getByText(/124\.4% Over budget →/)).toHaveClass(
			"text-ink-3",
			"font-normal",
		);
	});

	test("a state that stays is plain and shows no old state", () => {
		renderCard(RETRO, 2);
		const state = screen.getByText("6.0% · On track");
		expect(state).not.toHaveClass("font-semibold");
		expect(card()).not.toHaveTextContent("→");
	});

	test("has a solid edge", () => {
		renderCard(RETRO, 0);
		expect(card()).not.toHaveClass("border-dashed");
	});

	test("a month with no new limit that has spending moves to Not budgeted", () => {
		const change: BudgetChange = {
			scope: "from",
			month: "2026-10",
			limitMinor: null,
		};
		const preview = goldenPreview("entertainment", change);
		render(
			<ul>
				<PreviewCard
					month={preview.months[0]!}
					change={change}
					context={{ ...FOOD, category: "entertainment" }}
					figures="ready"
				/>
			</ul>,
		);
		expect(card()).toHaveTextContent("Now No Budget");
		expect(card()).toHaveTextContent("Moves to Not budgeted");
		expect(card()).toHaveTextContent(
			"214.8% Over budget → Moves to Not budgeted",
		);
	});

	test("writes figures in the profile's language", () => {
		renderCard(RETRO, 0, { context: { ...FOOD, formats: DE } });
		expect(card()).toHaveTextContent("Sept. 2026");
		expect(card()).toHaveTextContent(/6\.000,00\s€/);
		expect(card()).toHaveTextContent(/72,1\s%\s·\sOn track/);
	});
});

describe("an unchanged month (BR-F04-26)", () => {
	test("one month only: the month before is Unchanged, with a dashed edge", () => {
		renderCard(ONE, 0, { isDimmed: true });
		expect(card()).toHaveTextContent("Sept 2026");
		expect(card()).toHaveTextContent("₹6,000.00");
		expect(card()).toHaveTextContent("Unchanged");
		expect(card()).toHaveClass("border-dashed");
		expect(card()).not.toHaveTextContent("Was");
	});

	test("one month only: the month after is Back to the schedule", () => {
		renderCard(ONE, 2, { isDimmed: true });
		expect(card()).toHaveTextContent("₹5,000.00");
		expect(card()).toHaveTextContent("Back to the schedule");
	});

	test("keeps its one-month limit when a later change leaves it", () => {
		const raised = setMonth(goldenBudget("food"), "2026-10", 800000);
		const preview = goldenPreview("food", RETRO, raised);
		render(
			<ul>
				<PreviewCard
					month={preview.months[1]!}
					change={RETRO}
					context={FOOD}
					figures="ready"
				/>
			</ul>,
		);
		expect(card()).toHaveTextContent("₹8,000.00");
		expect(card()).toHaveTextContent("Keeps its one-month limit");
		expect(card()).toHaveClass("border-dashed");
	});

	test("a dimmed card is dashed even when it changes", () => {
		renderCard(RETRO, 0, { isDimmed: true });
		expect(card()).toHaveClass("border-dashed");
	});
});

describe("without the spending", () => {
	test("while it loads, a line holds the state's place", () => {
		const { container } = renderCard(RETRO, 0, { figures: "loading" });
		expect(card()).toHaveTextContent("Now ₹7,000.00");
		expect(card()).not.toHaveTextContent("On track");
		expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
	});

	test("when it is missing, the limits show alone", () => {
		const { container } = renderCard(RETRO, 0, { figures: "missing" });
		expect(card()).toHaveTextContent("Was ₹6,000.00");
		expect(card()).toHaveTextContent("Now ₹7,000.00");
		expect(card()).not.toHaveTextContent("On track");
		expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
	});

	test("an unchanged card says the same without spending", () => {
		renderCard(ONE, 2, { figures: "missing" });
		expect(card()).toHaveTextContent("Back to the schedule");
	});
});

describe("PreviewCard's root", () => {
	test("takes a className", () => {
		renderCard(RETRO, 0, { className: "extra" });
		expect(card()).toHaveClass("extra");
	});
});
