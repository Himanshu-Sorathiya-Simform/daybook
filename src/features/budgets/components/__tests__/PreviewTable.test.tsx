import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { setMonth } from "@/lib/budgets/model";
import type { BudgetChange } from "@/lib/budgets/preview";
import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import { goldenPreview } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import type { PreviewContext } from "../../lib/preview";
import { PreviewTable, type PreviewTableProps } from "../PreviewTable";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const context = (category: PreviewContext["category"]): PreviewContext => ({
	category,
	current: "2026-11",
	formats: IN,
});

// F04 section 5, a long change: shopping at 4,000.00 from November 2023.
const LONG: BudgetChange = { scope: "from", month: "2023-11", limitMinor: 400000 };

function renderTable(props: Partial<PreviewTableProps> = {}) {
	const onHighlight = vi.fn();
	const view = render(
		<PreviewTable
			preview={goldenPreview("shopping", LONG)}
			change={LONG}
			context={context("shopping")}
			figures="ready"
			onHighlight={onHighlight}
			{...props}
		/>,
	);
	return { ...view, onHighlight, user: userEvent.setup() };
}

const rows = () => within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");

describe("PreviewTable (BR-F04-26)", () => {
	test("is a table named Months that change with Months, Limit and State columns", () => {
		renderTable();
		expect(
			screen.getByRole("table", { name: "Months that change" }),
		).toBeVisible();
		expect(
			screen.getAllByRole("columnheader").map((header) => header.textContent),
		).toEqual(["Months", "Limit", "State"]);
	});

	test("lists the four groups of the long change, then the months after", () => {
		renderTable();
		// Four groups and the tail row.
		expect(rows()).toHaveLength(5);
		const first = within(rows()[0]!);
		expect(first.getByRole("rowheader")).toHaveTextContent(
			"Nov 2023 to Aug 202634 months",
		);
		const cells = first.getAllByRole("cell");
		expect(cells[0]).toHaveTextContent("Was No Budget → , now ₹4,000.00");
		expect(cells[1]).toHaveTextContent("No Shopping spending · On track");
		expect(within(rows()[1]!).getByRole("rowheader")).toHaveTextContent(
			"Sept 2026",
		);
		expect(within(rows()[1]!).getAllByRole("cell")[1]).toHaveTextContent(
			"80.0% Nearing limit → 60.0% · On track",
		);
		expect(within(rows()[2]!).getAllByRole("cell")[1]).toHaveTextContent(
			"100.0% At limit → 75.0% · On track",
		);
		expect(within(rows()[3]!).getAllByRole("cell")[1]).toHaveTextContent(
			"No Shopping spending · On track",
		);
	});

	test("strikes the old limit through", () => {
		renderTable();
		const old = within(rows()[1]!).getByText("₹3,000.00");
		expect(old.tagName).toBe("S");
	});

	test("ends with Dec 2026 onward, the new limit and that it carries on", () => {
		renderTable();
		const tail = rows().at(-1)!;
		expect(within(tail).getByRole("rowheader")).toHaveTextContent(
			"Dec 2026 onward",
		);
		expect(within(tail).getByRole("cell")).toHaveTextContent(
			"₹4,000.00, carries on until you change it",
		);
	});

	test("a change with no tail, such as one month only, has no tail row", () => {
		const change: BudgetChange = {
			scope: "month",
			month: "2026-10",
			limitMinor: 800000,
		};
		renderTable({
			preview: goldenPreview("food", change),
			change,
			context: context("food"),
		});
		expect(screen.queryByText(/onward/)).not.toBeInTheDocument();
	});

	test("a group's state is bold in the new state's colour when it changes", () => {
		renderTable();
		const state = within(rows()[1]!).getByText("60.0% · On track");
		expect(state).toHaveClass("font-semibold", "text-ink");
		const stays = within(rows()[3]!).getByText(
			"No Shopping spending · On track",
		);
		expect(stays).not.toHaveClass("font-semibold");
	});

	test("an unchanged group says why instead of showing a state", () => {
		const raised = setMonth(goldenBudget("food"), "2026-10", 800000);
		const change: BudgetChange = {
			scope: "from",
			month: "2026-06",
			limitMinor: 700000,
		};
		renderTable({
			preview: goldenPreview("food", change, raised),
			change,
			context: context("food"),
		});
		const row = rows().find((each) => within(each).queryByText("Oct 2026"))!;
		expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("₹8,000.00");
		expect(within(row).getAllByRole("cell")[0]).not.toHaveTextContent("Was");
		expect(within(row).getAllByRole("cell")[1]).toHaveTextContent(
			"Keeps its one-month limit",
		);
	});
});

describe("the pointer", () => {
	test("a row under it highlights its months, and leaving clears them", async () => {
		const { user, onHighlight } = renderTable();
		await user.hover(rows()[0]!);
		expect(onHighlight).toHaveBeenLastCalledWith({
			first: "2023-11",
			last: "2026-08",
		});
		await user.hover(rows()[2]!);
		expect(onHighlight).toHaveBeenLastCalledWith({
			first: "2026-10",
			last: "2026-10",
		});
		await user.unhover(rows()[2]!);
		expect(onHighlight).toHaveBeenLastCalledWith(null);
	});
});

describe("more than six groups (BR-F04-26)", () => {
	// Every month spends differently, so every month is a group: eleven, January to November.
	const change: BudgetChange = {
		scope: "from",
		month: "2026-01",
		limitMinor: 700000,
	};
	const preview = goldenPreview(
		"food",
		change,
		goldenBudget("food"),
		(month) => Number(month.slice(5)) * 100,
	);
	const eleven = () => renderTable({ preview, change, context: context("food") });

	test("shows six groups at first, then Show 5 more", () => {
		eleven();
		// Six groups and the tail, and the button's row.
		expect(rows()).toHaveLength(8);
		expect(screen.getByRole("button", { name: "Show 5 more" })).toBeVisible();
		expect(screen.queryByText("Jul 2026")).not.toBeInTheDocument();
	});

	test("Show 5 more lists every group, and Show fewer goes back", async () => {
		const { user } = eleven();
		await user.click(screen.getByRole("button", { name: "Show 5 more" }));
		expect(rows()).toHaveLength(13);
		expect(screen.getByText("Nov 2026")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Show fewer" }));
		expect(rows()).toHaveLength(8);
		expect(screen.getByRole("button", { name: "Show 5 more" })).toBeVisible();
	});

	test("the tail stays last, after the button", async () => {
		eleven();
		const last = rows().at(-1)!;
		expect(within(last).getByRole("rowheader")).toHaveTextContent(
			"Dec 2026 onward",
		);
	});

	test("six groups or fewer have no button", () => {
		renderTable();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("exactly six groups have no button", () => {
		const six: BudgetChange = {
			scope: "from",
			month: "2026-06",
			limitMinor: 700000,
		};
		renderTable({
			preview: goldenPreview(
				"food",
				six,
				goldenBudget("food"),
				(month) => Number(month.slice(5)) * 100,
			),
			change: six,
			context: context("food"),
		});
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});

describe("without the spending", () => {
	test("while it loads, the state column holds its place with no text", () => {
		const { container } = renderTable({ figures: "loading" });
		expect(screen.queryByText(/On track/)).not.toBeInTheDocument();
		expect(
			container.querySelectorAll('td [aria-hidden="true"]').length,
		).toBeGreaterThan(0);
		expect(within(rows()[1]!).getAllByRole("cell")[0]).toHaveTextContent(
			"₹3,000.00",
		);
	});

	test("when it is missing, the limits show alone", () => {
		renderTable({ figures: "missing" });
		expect(screen.queryByText(/On track/)).not.toBeInTheDocument();
		expect(within(rows()[1]!).getAllByRole("cell")[0]).toHaveTextContent(
			"Was ₹3,000.00 → , now ₹4,000.00",
		);
	});
});

describe("PreviewTable's root", () => {
	test("takes a className", () => {
		renderTable({ className: "extra" });
		expect(screen.getByRole("table")).toHaveClass("extra");
	});
});
