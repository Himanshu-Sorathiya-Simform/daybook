import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { BudgetPayees } from "../../hooks/useBudgetPayees";
import type { Formats } from "../../lib/labels";
import { WhereItWent, type WhereItWentProps } from "../WhereItWent";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

// F04 section 5: October food's top payees, over 4 Transactions.
const FOOD: BudgetPayees = {
	payees: [
		{ key: "bigbasket", label: "BigBasket", count: 1, outMinor: 290000 },
		{ key: "zomato", label: "Zomato", count: 2, outMinor: 230000 },
		{ key: "swiggy", label: "Swiggy", count: 1, outMinor: 102000 },
	],
	count: 4,
};

function renderPayees(props: Partial<WhereItWentProps> = {}) {
	return render(
		<WhereItWent
			category="food"
			month="2026-10"
			payees={FOOD}
			formats={IN}
			{...props}
		/>,
	);
}

describe("WhereItWent (BR-F04-30)", () => {
	test("is a section named for the month", () => {
		renderPayees();
		expect(
			screen.getByRole("region", { name: "Where it went in October" }),
		).toBeVisible();
	});

	// F04 section 5, Food's panel
	test("golden October food: BigBasket, Zomato and Swiggy with their amounts", () => {
		renderPayees();
		expect(
			screen.getAllByRole("listitem").map((each) => each.textContent),
		).toEqual([
			"BIBigBasket₹2,900.00",
			"ZOZomato₹2,300.00",
			"SWSwiggy₹1,020.00",
		]);
	});

	// AC-F04-10, BR-F04-17
	test("See 4 Transactions opens the category's Transactions for the month", () => {
		renderPayees();
		expect(
			screen.getByRole("link", { name: "See 4 Transactions" }),
		).toHaveAttribute(
			"href",
			"/transactions?from=2026-10-01&to=2026-10-31&cat=food",
		);
	});

	test("one Transaction reads in the singular", () => {
		renderPayees({ payees: { ...FOOD, count: 1 } });
		expect(
			screen.getByRole("link", { name: "See 1 Transaction" }),
		).toBeVisible();
	});

	test("a payee with no label shows its key", () => {
		renderPayees({
			payees: {
				payees: [
					{ key: "corner shop", label: null, count: 1, outMinor: 5000 },
				],
				count: 1,
			},
		});
		expect(
			within(screen.getByRole("listitem")).getByText("corner shop"),
		).toBeVisible();
	});

	test("a payee with refunds above spending shows a negative amount", () => {
		renderPayees({
			payees: {
				payees: [{ key: "shop", label: "Shop", count: 2, outMinor: -5000 }],
				count: 2,
			},
		});
		expect(screen.getByRole("listitem")).toHaveTextContent("−₹50.00");
	});

	test("while the payees load: the heading over three skeleton rows and a skeleton link", () => {
		const { container } = renderPayees({ payees: undefined });
		const region = screen.getByRole("region", {
			name: "Where it went in October",
		});
		expect(region).toHaveAttribute("aria-busy", "true");
		expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		const rows = container.querySelectorAll('ul[aria-hidden="true"] > li');
		expect(rows).toHaveLength(3);
		expect(rows[0]).toHaveClass("h-9");
		expect(rows[0]?.querySelector(".rounded-full")).toHaveClass("size-7");
	});

	test("loaded, it is no longer busy", () => {
		renderPayees();
		expect(
			screen.getByRole("region", { name: "Where it went in October" }),
		).toHaveAttribute("aria-busy", "false");
	});

	test("takes the caller's classes", () => {
		renderPayees({ className: "mt-2" });
		expect(
			screen.getByRole("region", { name: "Where it went in October" }),
		).toHaveClass("flex", "mt-2");
	});
});
