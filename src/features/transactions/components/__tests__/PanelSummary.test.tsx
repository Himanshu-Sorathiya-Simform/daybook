import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { LabelLocale } from "../../lib/labels";
import { CHECK_A_SUMMARY } from "../../lib/__tests__/fixtures";
import { PanelSummary } from "../PanelSummary";

// The golden profile (IN, INR) on the golden clock's day (TST-3).
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

const HINT =
	"Select a Transaction to see it here. Up and down arrows move, Enter opens.";

/** What each item of a part reads, without the avatar's initials, which screen readers skip. */
const items = (name: string) =>
	within(screen.getByRole("region", { name }))
		.getAllByRole("listitem")
		.map((each) => {
			const copy = each.cloneNode(true) as HTMLElement;
			copy.querySelectorAll("[aria-hidden]").forEach((hidden) =>
				hidden.remove(),
			);
			return copy.textContent;
		});
/** The bars of "Out by category". */
const bars = () => [
	...screen
		.getByRole("region", { name: "Out by category" })
		.querySelectorAll<HTMLElement>("li > span[aria-hidden]"),
];

describe("PanelSummary (BR-F03-71)", () => {
	// AC-F03-56
	test("check A at M1: the heading, the five categories and the top 4 payees", () => {
		render(
			<PanelSummary
				summary={CHECK_A_SUMMARY}
				isPending={false}
				locale={IN}
			/>,
		);

		expect(screen.getByText("This list")).toBeInTheDocument();
		expect(screen.getByText("11 Transactions")).toBeInTheDocument();
		expect(screen.getByText("1 Oct to 31 Oct")).toBeInTheDocument();
		expect(items("Out by category")).toEqual([
			"Housing₹18,000.00",
			"Food₹6,220.00",
			"Shopping₹3,000.00",
			"Entertainment₹2,148.00",
			"Transportation₹1,800.00",
		]);
		expect(items("Top payees by Out")).toEqual([
			"Sunrise Apartments1₹18,000.00",
			"Croma2₹3,000.00",
			"BigBasket1₹2,900.00",
			"Zomato1₹2,300.00",
		]);
		expect(screen.getByText(HINT)).toBeInTheDocument();
	});

	test("each bar's length is its Out against the largest, in its category's colour", () => {
		render(
			<PanelSummary
				summary={CHECK_A_SUMMARY}
				isPending={false}
				locale={IN}
			/>,
		);

		expect(bars().map((bar) => bar.style.width)).toEqual([
			"100%",
			`${(622000 / 1800000) * 100}%`,
			`${(300000 / 1800000) * 100}%`,
			`${(214800 / 1800000) * 100}%`,
			"10%",
		]);
		expect(bars()[0]!.style.background).toBe("var(--cat-housing)");
	});

	test("a bar too short to see keeps 2% so it shows; a negative Out shows none", () => {
		render(
			<PanelSummary
				summary={{
					...CHECK_A_SUMMARY,
					byCategory: [
						{ key: "housing", label: null, count: 1, outMinor: 1000000 },
						{ key: "food", label: null, count: 1, outMinor: 100 },
						{ key: "shopping", label: null, count: 1, outMinor: -500 },
					],
				}}
				isPending={false}
				locale={IN}
			/>,
		);

		expect(bars().map((bar) => bar.style.width)).toEqual(["100%", "2%", "0%"]);
		expect(items("Out by category")[2]).toBe("Shopping−₹5.00");
	});

	test("a long category name may wrap, beside bars that all start in one column", () => {
		render(
			<PanelSummary
				summary={{
					...CHECK_A_SUMMARY,
					byCategory: [
						{ key: "fees_taxes", label: null, count: 1, outMinor: 1000 },
						{ key: "food", label: null, count: 1, outMinor: 500 },
					],
				}}
				isPending={false}
				locale={IN}
			/>,
		);
		const list = screen
			.getByRole("region", { name: "Out by category" })
			.querySelector("ul")!;

		expect(list).toHaveClass("grid");
		for (const item of within(list).getAllByRole("listitem")) {
			expect(item).toHaveClass("col-span-3", "grid-cols-subgrid");
			expect(item.firstElementChild).toHaveClass(
				"whitespace-normal",
				"min-w-0",
			);
			expect(item.firstElementChild).not.toHaveClass("whitespace-nowrap");
		}
	});

	test("a payee without a label shows its key", () => {
		render(
			<PanelSummary
				summary={{
					...CHECK_A_SUMMARY,
					byPayee: [
						{ key: "swiggy", label: null, count: 3, outMinor: 1000 },
					],
				}}
				isPending={false}
				locale={IN}
			/>,
		);

		expect(items("Top payees by Out")).toEqual(["swiggy3₹10.00"]);
	});

	test("one Transaction on one day reads in the singular with that day", () => {
		render(
			<PanelSummary
				summary={{
					...CHECK_A_SUMMARY,
					count: 1,
					firstOn: "2026-10-19",
					lastOn: "2026-10-19",
				}}
				isPending={false}
				locale={IN}
			/>,
		);

		expect(screen.getByText("1 Transaction")).toBeInTheDocument();
		expect(screen.getByText("19 Oct")).toBeInTheDocument();
	});

	test("with no rows: 0 Transactions and the hint, the empty parts left out", () => {
		render(
			<PanelSummary
				summary={{
					count: 0,
					incomeMinor: 0,
					spendingMinor: 0,
					toGoalsMinor: 0,
					firstOn: null,
					lastOn: null,
					byCategory: [],
					byPayee: [],
					currency: "INR",
				}}
				isPending={false}
				locale={IN}
			/>,
		);

		expect(screen.getByText("0 Transactions")).toBeInTheDocument();
		expect(screen.queryByRole("region")).toBeNull();
		expect(screen.getByText(HINT)).toBeInTheDocument();
	});

	test("while the summary loads: skeleton lines, nothing else", () => {
		render(
			<PanelSummary
				summary={undefined}
				isPending
				locale={IN}
			/>,
		);

		expect(
			screen.getByRole("status", { name: "Loading the summary" }),
		).toHaveAttribute("aria-busy", "true");
		expect(screen.queryByText(HINT)).toBeNull();
	});

	test("a failed summary leaves only the hint", () => {
		render(
			<PanelSummary
				summary={undefined}
				isPending={false}
				locale={IN}
			/>,
		);

		expect(screen.queryByText("This list")).toBeNull();
		expect(screen.queryByRole("region")).toBeNull();
		expect(screen.getByText(HINT)).toBeInTheDocument();
	});
});
