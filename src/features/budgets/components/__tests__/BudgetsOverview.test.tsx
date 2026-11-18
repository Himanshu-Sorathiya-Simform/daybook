import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { StateLabel } from "@/lib/budgets/model";
import type { Formats } from "../../lib/labels";
import { monthAnswer } from "../../lib/__tests__/fixtures";
import type { BudgetMonthAnswer } from "../../lib/types";
import { BudgetsOverview, type BudgetsOverviewProps } from "../BudgetsOverview";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

function renderOverview(
	view: BudgetMonthAnswer,
	props: Partial<BudgetsOverviewProps> = {},
) {
	const onFilterChange = vi.fn();
	const result = render(
		<BudgetsOverview
			view={view}
			formats={IN}
			today={null}
			filter={null}
			onFilterChange={onFilterChange}
			{...props}
		/>,
	);
	return { ...result, onFilterChange, user: userEvent.setup() };
}

const count = (name: RegExp) => screen.getByRole("button", { name });

describe("golden October (F04 section 5)", () => {
	test("the label, the readout and its figures", () => {
		const { container } = renderOverview(monthAnswer("2026-10"));
		expect(screen.getByText("Budgeted spending in October")).toBeVisible();
		expect(container).toHaveTextContent("₹13,168.00");
		expect(container).toHaveTextContent(
			"of ₹11,000.00 · 119.7% · Over by ₹2,168.00",
		);
		expect(screen.getByText("Over by ₹2,168.00")).toHaveClass("text-neg");
	});

	test("the counts: Over budget 2, At limit 1, Nearing limit 1, On track 0", () => {
		renderOverview(monthAnswer("2026-10"));
		expect(
			screen.getAllByRole("button").map((button) => button.textContent),
		).toEqual(["Over budget 2", "At limit 1", "Nearing limit 1", "On track 0"]);
	});

	test("Not budgeted and Total spending add up", () => {
		const { container } = renderOverview(monthAnswer("2026-10"));
		expect(container).toHaveTextContent("Not budgeted₹18,000.00");
		expect(container).toHaveTextContent("Total spending₹31,168.00");
	});

	test("the tick's caption; no today marker outside the current month", () => {
		const { container } = renderOverview(monthAnswer("2026-10"));
		expect(screen.getByText("Black tick: the ₹11,000.00 limit.")).toBeVisible();
		expect(screen.queryByText(/^Blue: day/)).not.toBeInTheDocument();
		expect(container.querySelector('[data-part="today"]')).toBeNull();
	});

	test("the overall bar is 12px and shows the 119.7%", () => {
		const { container } = renderOverview(monthAnswer("2026-10"));
		const bar = container.querySelector(
			'[aria-hidden="true"].h-3',
		) as HTMLElement;
		expect(bar).not.toBeNull();
		expect(bar.querySelector('[data-part="over"]')).not.toBeNull();
	});
});

describe("golden September and November (F04 section 5)", () => {
	test("September reads 81.0% with ₹1,901.00 left, in the warning colour", () => {
		const { container } = renderOverview(monthAnswer("2026-09"));
		expect(container).toHaveTextContent(
			"of ₹10,000.00 · 81.0% · ₹1,901.00 left",
		);
		expect(screen.getByText("₹1,901.00 left")).toHaveClass("text-warn");
		expect(
			screen.getAllByRole("button").map((button) => button.textContent),
		).toEqual(["Over budget 0", "At limit 0", "Nearing limit 2", "On track 1"]);
		expect(container).toHaveTextContent("Not budgeted₹19,950.00");
		expect(container).toHaveTextContent("Total spending₹28,049.00");
	});

	// The golden clock's day 2 of November.
	test("the current month marks today and says which day", () => {
		const { container } = renderOverview(monthAnswer("2026-11"), {
			today: "2026-11-02",
		});
		expect(container).toHaveTextContent(
			"of ₹11,000.00 · 3.8% · ₹10,580.00 left",
		);
		expect(screen.getByText("Blue: day 2 of 30")).toHaveClass("text-accent");
		expect(container.querySelector('[data-part="today"]')).not.toBeNull();
	});
});

describe("past 160% (BR-F04-15)", () => {
	test("the caption adds that the bar stops", () => {
		const view = monthAnswer("2026-10");
		renderOverview({
			...view,
			overall: {
				...view.overall,
				spentMinor: 2000000,
				utilizationTenths: 1818,
			},
		});
		expect(
			screen.getByText(
				"Black tick: the ₹11,000.00 limit. The bar stops at 160%.",
			),
		).toBeVisible();
	});
});

describe("the counts filter the list (BR-F04-31)", () => {
	test("a count asks for its state; pressing the chosen count again clears it", async () => {
		const { user, onFilterChange, rerender } = renderOverview(
			monthAnswer("2026-10"),
		);
		await user.click(count(/^Over budget/));
		expect(onFilterChange).toHaveBeenLastCalledWith("over");
		rerender(
			<BudgetsOverview
				view={monthAnswer("2026-10")}
				formats={IN}
				today={null}
				filter="over"
				onFilterChange={onFilterChange}
			/>,
		);
		expect(count(/^Over budget/)).toHaveAttribute("aria-pressed", "true");
		await user.click(count(/^Over budget/));
		expect(onFilterChange).toHaveBeenLastCalledWith(null);
	});

	test.each([
		[/^At limit/, "at"],
		[/^Nearing limit/, "warning"],
		[/^On track/, "ok"],
	] as [RegExp, StateLabel][])(
		"%s asks for %s; At limit stays apart from Over budget",
		async (name, state) => {
			const { user, onFilterChange } = renderOverview(monthAnswer("2026-10"));
			await user.click(count(name));
			expect(onFilterChange).toHaveBeenLastCalledWith(state);
		},
	);

	test("choosing another count moves the filter", async () => {
		const { user, onFilterChange } = renderOverview(monthAnswer("2026-10"), {
			filter: "over",
		});
		await user.click(count(/^At limit/));
		expect(onFilterChange).toHaveBeenLastCalledWith("at");
		expect(count(/^Over budget/)).toHaveAttribute("aria-pressed", "true");
		expect(count(/^At limit/)).toHaveAttribute("aria-pressed", "false");
	});
});

describe("layout", () => {
	test("the counts sit beside the figures when there is room, and stack when there is not", () => {
		const { container } = renderOverview(monthAnswer("2026-10"));
		const grid = within(container).getByText("Budgeted spending in October")
			.parentElement?.parentElement as HTMLElement;
		expect(grid).toHaveClass(
			"grid-cols-1",
			"@xl:grid-cols-[minmax(0,1.4fr)_minmax(13.75rem,1fr)]",
		);
	});

	test("takes the caller's classes", () => {
		const { container } = renderOverview(monthAnswer("2026-10"), {
			className: "mt-2",
		});
		expect(container.firstElementChild).toHaveClass("mt-2", "@container");
	});
});
