import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { monthAnswer } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import { BudgetPanelSummary } from "../BudgetPanelSummary";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

describe("BudgetPanelSummary (BR-F04-30)", () => {
	test("This month and the month", () => {
		render(
			<BudgetPanelSummary
				month="2026-10"
				view={monthAnswer("2026-10")}
				formats={IN}
			/>,
		);
		expect(screen.getByText("This month")).toBeVisible();
		expect(
			screen.getByRole("heading", { level: 2, name: "October 2026" }),
		).toBeVisible();
	});

	// F04 section 5, the October summary panel
	test("golden October compared with September: three rows, each with its note", () => {
		render(
			<BudgetPanelSummary
				month="2026-10"
				view={monthAnswer("2026-10")}
				formats={IN}
			/>,
		);
		const compared = screen.getByRole("region", {
			name: "Compared with September",
		});
		expect(
			within(compared).getByRole("heading", {
				name: "Compared with September",
			}),
		).toBeVisible();
		expect(
			within(compared)
				.getAllByRole("term")
				.map((t) => t.textContent),
		).toEqual(["Budgeted spending", "Limits", "Over or at limit"]);
		expect(
			within(compared)
				.getAllByRole("definition")
				.map((each) => each.textContent),
		).toEqual([
			"₹13,168.00",
			"₹5,069.00 more than September",
			"₹11,000.00",
			"₹1,000.00 more than September · 4 Budgets, 3 in September",
			"3",
			"0 in September",
		]);
	});

	test("How limits work and the hint", () => {
		render(
			<BudgetPanelSummary
				month="2026-10"
				view={monthAnswer("2026-10")}
				formats={IN}
			/>,
		);
		const box = screen.getByRole("region", { name: "How limits work" });
		expect(box).toHaveTextContent(
			"How limits workA limit carries forward to every later month until you change it. Past months keep the limits they had.For a one-off, like a festival month, change the limit for one month only.Nearing limit starts at 80.0%. Over budget starts at 100.0%.",
		);
		expect(
			screen.getByText(
				"Select a Budget to see its last 6 months and limit history. Up and down arrows move.",
			),
		).toBeVisible();
	});

	test("a month with no Budget still compares: August with July", () => {
		render(
			<BudgetPanelSummary
				month="2026-08"
				view={monthAnswer("2026-08")}
				formats={IN}
			/>,
		);
		expect(
			screen.getByRole("region", { name: "Compared with July" }),
		).toHaveTextContent(
			"Budgeted spending₹0.00Same as JulyLimits₹0.00Same as JulyOver or at limit0Same as July",
		);
	});

	test("while the month loads: everything but the figures and notes, which are skeleton lines", () => {
		const { container } = render(
			<BudgetPanelSummary
				month="2026-10"
				view={undefined}
				formats={IN}
			/>,
		);
		expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
		expect(
			screen.getByRole("heading", { level: 2, name: "October 2026" }),
		).toBeVisible();
		const compared = screen.getByRole("region", {
			name: "Compared with September",
		});
		expect(
			within(compared)
				.getAllByRole("term")
				.map((t) => t.textContent),
		).toEqual(["Budgeted spending", "Limits", "Over or at limit"]);
		expect(
			within(compared)
				.getAllByRole("definition")
				.map((each) => each.textContent),
		).toEqual(["", "", "", "", "", ""]);
		expect(compared.querySelectorAll(".bg-track")).toHaveLength(6);
		expect(
			screen.getByRole("region", { name: "How limits work" }),
		).toBeVisible();
		expect(screen.getByText(/^Select a Budget/)).toBeVisible();
	});

	test("loaded, it is no longer busy", () => {
		const { container } = render(
			<BudgetPanelSummary
				month="2026-10"
				view={monthAnswer("2026-10")}
				formats={IN}
			/>,
		);
		expect(container.firstElementChild).toHaveAttribute("aria-busy", "false");
	});

	test("takes the caller's classes", () => {
		const { container } = render(
			<BudgetPanelSummary
				month="2026-10"
				view={monthAnswer("2026-10")}
				formats={IN}
				className="mt-2"
			/>,
		);
		expect(container.firstElementChild).toHaveClass("flex", "mt-2");
	});
});
