import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { SummaryAnswer } from "../../lib/types";
import { HeaderTotals, type HeaderTotalsProps } from "../HeaderTotals";

const IN = { currency: "INR", numberLocale: "hi-IN-u-nu-latn" } as const;

// Golden check A (docs/03-golden-dataset.md): October 2026.
const CHECK_A: SummaryAnswer = {
	count: 14,
	incomeMinor: 8500000,
	spendingMinor: 3116800,
	toGoalsMinor: 700000,
	firstOn: "2026-10-01",
	lastOn: "2026-10-31",
	currency: "INR",
};

function renderTotals(props: Partial<HeaderTotalsProps> = {}) {
	const onRetry = vi.fn();
	const view = render(
		<HeaderTotals
			summary={CHECK_A}
			isError={false}
			onRetry={onRetry}
			locale={IN}
			{...props}
		/>,
	);
	return { ...view, onRetry };
}

/** Each figure's label and value, in order. */
function figures() {
	return screen
		.getAllByRole("term")
		.map((term) => [term.textContent, term.nextElementSibling?.textContent]);
}

describe("figures (BR-F03-41)", () => {
	test("show Count, In, Out and To Goals for check A", () => {
		renderTotals();

		expect(figures()).toEqual([
			["Count", "14"],
			["In", "₹85,000.00"],
			["Out", "₹31,168.00"],
			["To Goals", "₹7,000.00"],
		]);
	});

	test("show check B, food in October", () => {
		renderTotals({
			summary: {
				...CHECK_A,
				count: 4,
				incomeMinor: 0,
				spendingMinor: 622000,
				toGoalsMinor: 0,
			},
		});

		expect(figures()).toEqual([
			["Count", "4"],
			["In", "₹0.00"],
			["Out", "₹6,220.00"],
			["To Goals", "₹0.00"],
		]);
	});

	test("show zeros when nothing matches", () => {
		renderTotals({
			summary: {
				...CHECK_A,
				count: 0,
				incomeMinor: 0,
				spendingMinor: 0,
				toGoalsMinor: 0,
				firstOn: null,
				lastOn: null,
			},
		});

		expect(figures()).toEqual([
			["Count", "0"],
			["In", "₹0.00"],
			["Out", "₹0.00"],
			["To Goals", "₹0.00"],
		]);
	});

	test("show a negative figure with its minus sign (TXN-7)", () => {
		// Refunds larger than spending, and more taken from Goals than put in.
		renderTotals({
			summary: { ...CHECK_A, spendingMinor: -150000, toGoalsMinor: -100000 },
		});

		expect(figures()[2]).toEqual(["Out", "−₹1,500.00"]);
		expect(figures()[3]).toEqual(["To Goals", "−₹1,000.00"]);
	});

	test("follow the profile's currency and number format", () => {
		renderTotals({
			summary: { ...CHECK_A, currency: "EUR", incomeMinor: 124050 },
			locale: { currency: "EUR", numberLocale: "de-DE" },
		});

		expect(figures()[1]?.[1]).toBe("1.240,50 €");
	});

	test("use tabular figures for every number", () => {
		renderTotals();

		for (const value of screen.getAllByRole("definition"))
			expect(value.querySelector(".figures") ?? value).toHaveClass("figures");
	});

	test("are not busy once they have an answer", () => {
		const { container } = renderTotals();

		expect(container.querySelector("dl")).not.toHaveAttribute("aria-busy");
	});
});

describe("changes", () => {
	test("follows a summary that changes", () => {
		const onRetry = vi.fn();
		const { rerender } = renderTotals();

		rerender(
			<HeaderTotals
				summary={{ ...CHECK_A, count: 15, spendingMinor: 3156800 }}
				isError={false}
				onRetry={onRetry}
				locale={IN}
			/>,
		);

		expect(figures()[0]).toEqual(["Count", "15"]);
		expect(figures()[2]).toEqual(["Out", "₹31,568.00"]);
	});

	test("goes from loading to the figures, and from an error to the figures after Retry", () => {
		const onRetry = vi.fn();
		const { rerender } = renderTotals({ summary: undefined, isError: true });
		expect(screen.getByRole("alert")).toBeVisible();

		rerender(
			<HeaderTotals
				summary={CHECK_A}
				isError={false}
				onRetry={onRetry}
				locale={IN}
			/>,
		);

		expect(screen.queryByRole("alert")).toBeNull();
		expect(figures()[0]).toEqual(["Count", "14"]);
	});
});

describe("loading", () => {
	test("shows a skeleton for each figure, the labels already in place, and says it is busy", () => {
		const { container } = renderTotals({ summary: undefined });

		expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual([
			"Count",
			"In",
			"Out",
			"To Goals",
		]);
		expect(container.querySelector("dl")).toHaveAttribute("aria-busy", "true");
		for (const value of screen.getAllByRole("definition"))
			expect(value.firstElementChild).toHaveAttribute("aria-hidden", "true");
		expect(screen.queryByText(/₹/)).toBeNull();
	});

	test("shows no error while it is still loading", () => {
		renderTotals({ summary: undefined, isError: false });

		expect(screen.queryByRole("alert")).toBeNull();
	});
});

describe("error", () => {
	test("says the totals could not be loaded, at once, with Retry", async () => {
		const user = userEvent.setup();
		const { onRetry } = renderTotals({ summary: undefined, isError: true });

		expect(screen.getByRole("alert")).toHaveTextContent(
			"Totals could not be loaded.",
		);
		expect(screen.queryByRole("term")).toBeNull();

		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledOnce();
	});

	test("Retry works from the keyboard", async () => {
		const user = userEvent.setup();
		const { onRetry } = renderTotals({ summary: undefined, isError: true });

		await user.tab();
		await user.keyboard("{Enter}");

		expect(onRetry).toHaveBeenCalledOnce();
	});

	test("keeps the last figures when a later refetch fails", () => {
		renderTotals({ isError: true });

		expect(screen.queryByRole("alert")).toBeNull();
		expect(figures()[0]).toEqual(["Count", "14"]);
	});

	test("marks the message with an icon hidden from screen readers", () => {
		const { container } = renderTotals({ summary: undefined, isError: true });

		expect(container.querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});
});

describe("layout", () => {
	test("sits in a framed section, taking the caller's classes", () => {
		const { container } = renderTotals({ className: "mt-2" });

		expect(container.firstElementChild).toHaveClass("rounded-section", "mt-2");
	});

	test("the error row takes the caller's classes too", () => {
		const { container } = renderTotals({
			summary: undefined,
			isError: true,
			className: "mt-2",
		});

		expect(container.firstElementChild).toHaveClass("mt-2");
		expect(
			within(container.firstElementChild as HTMLElement).getByRole("alert"),
		).toBeVisible();
	});
});
