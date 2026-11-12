import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ONBOARDING_TEXT } from "../../lib/messages";
import type { PreviewChoices } from "../../lib/preview";
import { OnboardingPreview } from "../OnboardingPreview";

// Monday 2 Nov 2026, 12:00 in India (TST-3's golden clock).
const NOW = new Date("2026-11-02T06:30:00.000Z");

const INDIA: PreviewChoices = {
	country: "IN",
	currency: "INR",
	timezone: "Asia/Kolkata",
	weekStart: "sunday",
};

const region = () => screen.getByRole("region", { name: "Preview" });

// D-511
describe("OnboardingPreview (F02 section 6)", () => {
	test("is a region named by its title, with its line", () => {
		render(
			<OnboardingPreview
				choices={INDIA}
				at={NOW}
			/>,
		);
		expect(
			within(region()).getByRole("heading", { level: 2, name: "Preview" }),
		).toBeInTheDocument();
		expect(
			within(region()).getByText(ONBOARDING_TEXT.preview.intro),
		).toBeInTheDocument();
	});

	test("shows the amounts, today and the week under their labels", () => {
		render(
			<OnboardingPreview
				choices={INDIA}
				at={NOW}
			/>,
		);
		for (const label of ["Amounts", "Today", "This week"])
			expect(within(region()).getByText(label)).toBeInTheDocument();
		expect(within(region()).getByText("−₹1,240.50")).toBeInTheDocument();
		expect(within(region()).getByText("63.3%")).toBeInTheDocument();
		expect(within(region()).getByText("Mon, 2 Nov")).toBeInTheDocument();
		expect(within(region()).getByText("12:00 pm")).toBeInTheDocument();
		expect(
			within(region()).getByText("Kolkata time (GMT+05:30)"),
		).toBeInTheDocument();
	});

	test("screen readers hear the sample amount whole; the split pieces are hidden", () => {
		render(
			<OnboardingPreview
				choices={INDIA}
				at={NOW}
			/>,
		);
		const whole = within(region()).getByText("₹1,00,000.00");
		expect(whole).toHaveClass("sr-only");
		const pieces = whole.nextElementSibling!;
		expect(pieces).toHaveAttribute("aria-hidden", "true");
		expect([...pieces.children].map((piece) => piece.textContent)).toEqual([
			"₹",
			"1,00,000",
			".00",
		]);
		expect(pieces.children[1]).toHaveClass("text-title");
	});

	test("a symbol after the number comes last, spaced as the format spaces it", () => {
		render(
			<OnboardingPreview
				choices={{ ...INDIA, country: "DE", currency: "EUR" }}
				at={NOW}
			/>,
		);
		const pieces =
			within(region()).getByText(/^100\.000,00/).nextElementSibling!;
		expect([...pieces.children].map((piece) => piece.textContent)).toEqual([
			"100.000",
			",00",
			"€",
		]);
		expect(pieces.children[2]).toHaveClass("ml-1");
	});

	test("the week is a list of seven days, today marked as the current date", () => {
		render(
			<OnboardingPreview
				choices={INDIA}
				at={NOW}
			/>,
		);
		const days = within(region()).getAllByRole("listitem");
		expect(days.map((day) => day.textContent)).toEqual([
			"Sun1",
			"Mon2",
			"Tue3",
			"Wed4",
			"Thu5",
			"Fri6",
			"Sat7",
		]);
		expect(days[1]).toHaveAttribute("aria-current", "date");
		expect(days[1]).toHaveClass("border-accent");
		for (const day of [days[0], ...days.slice(2)])
			expect(day).not.toHaveAttribute("aria-current");
	});

	test("before a country, says what it will show, and nothing else", () => {
		render(
			<OnboardingPreview
				choices={null}
				at={NOW}
			/>,
		);
		expect(
			within(region()).getByText(ONBOARDING_TEXT.preview.empty),
		).toBeInTheDocument();
		expect(within(region()).queryByText("Amounts")).not.toBeInTheDocument();
		expect(within(region()).queryByRole("list")).not.toBeInTheDocument();
	});

	test("while loading, an outline marked busy, even with choices", () => {
		render(
			<OnboardingPreview
				choices={INDIA}
				isLoading
				at={NOW}
			/>,
		);
		expect(region().querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(within(region()).queryByText("Amounts")).not.toBeInTheDocument();
		expect(
			within(region()).queryByText(ONBOARDING_TEXT.preview.empty),
		).not.toBeInTheDocument();
	});

	test("takes the caller's classes", () => {
		render(
			<OnboardingPreview
				choices={null}
				at={NOW}
				className="max-w-105"
			/>,
		);
		expect(region()).toHaveClass("rounded-section", "max-w-105");
	});
});
