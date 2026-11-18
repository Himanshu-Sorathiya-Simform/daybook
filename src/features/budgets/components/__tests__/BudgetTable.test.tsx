import type { SortingState } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { ExpenseCategory, StateLabel } from "@/lib/budgets/model";
import type { Formats } from "../../lib/labels";
import { monthAnswer } from "../../lib/__tests__/fixtures";
import type { BudgetMonthAnswer } from "../../lib/types";
import { BudgetTable, type BudgetTableProps } from "../BudgetTable";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

/** The table with its selection and filter held as the page holds them. */
function Host({
	view,
	start = null,
	startFilter = null,
	...props
}: Partial<BudgetTableProps> & {
	view: BudgetMonthAnswer;
	start?: ExpenseCategory | null;
	startFilter?: StateLabel | null;
}) {
	const [selected, setSelected] = useState<ExpenseCategory | null>(start);
	const [filter, setFilter] = useState<StateLabel | null>(startFilter);
	const [sorting, setSorting] = useState<SortingState>([]);
	return (
		<>
			<button type="button">Before</button>
			<BudgetTable
				view={view}
				formats={props.formats ?? IN}
				filter={filter}
				onFilterChange={(next) => {
					props.onFilterChange?.(next);
					setFilter(next);
				}}
				sorting={sorting}
				onSortingChange={setSorting}
				selected={selected}
				onSelect={(next) => {
					props.onSelect?.(next);
					setSelected(next);
				}}
				{...(props.className ? { className: props.className } : {})}
				{...(props.arrows ? { arrows: props.arrows } : {})}
			/>
			<input aria-label="Search" />
		</>
	);
}

function renderTable(props: Parameters<typeof Host>[0]) {
	const view = render(<Host {...props} />);
	return { ...view, user: userEvent.setup() };
}

const OCTOBER = monthAnswer("2026-10");
const SEPTEMBER = monthAnswer("2026-09");
const CAPTION = "October 2026. Select a column heading to sort.";

// The filter's chips are a grid too.
const grid = () => screen.getByRole("grid", { name: /Select a column heading/ });
/** A row's cells, left to right. */
const cellsOf = (row: HTMLElement) => [
	...row.querySelectorAll<HTMLElement>('[role="rowheader"], [role="gridcell"]'),
];
const heading = (name: string) => screen.getByRole("columnheader", { name });
/** The body rows' keys, top to bottom. */
const order = () =>
	within(grid())
		.getAllByRole("row")
		.slice(1)
		.map((row) => row.getAttribute("data-key"));
const rowOf = (key: string) =>
	document.querySelector<HTMLElement>(
		`[role="row"][data-key="${key}"]`,
	) as HTMLElement;
/** A row's cells as text, left to right. */
const cells = (key: string) => cellsOf(rowOf(key)).map((cell) => cell.textContent);

const MONTH_ORDER = [
	"budget:entertainment",
	"budget:food",
	"budget:shopping",
	"budget:transportation",
	"total",
	"unbudgeted:housing",
];

describe("golden October (BR-F04-18, F04 section 5)", () => {
	test("named by its caption, which shows above it", () => {
		renderTable({ view: OCTOBER });
		expect(screen.getByRole("grid", { name: CAPTION })).toBeVisible();
		expect(screen.getByText(CAPTION)).toBeVisible();
	});

	test("the columns, in order", () => {
		renderTable({ view: OCTOBER });
		expect(
			within(grid())
				.getAllByRole("columnheader")
				.map((cell) => cell.textContent),
		).toEqual([
			"Category",
			"Limit",
			"Spent",
			"Remaining",
			"Utilization",
			"State",
		]);
	});

	test("the Budgets in the month's order, then Budgeted total, then Not budgeted", () => {
		renderTable({ view: OCTOBER });
		expect(order()).toEqual(MONTH_ORDER);
	});

	test.each([
		[
			"budget:entertainment",
			[
				"Entertainment",
				"₹1,000.00",
				"₹2,148.00",
				"−₹1,148.00",
				"214.8%",
				"Over budget",
			],
		],
		[
			"budget:food",
			[
				"Food",
				"₹5,000.00",
				"₹6,220.00",
				"−₹1,220.00",
				"124.4%",
				"Over budget",
			],
		],
		[
			"budget:shopping",
			["Shopping", "₹3,000.00", "₹3,000.00", "₹0.00", "100.0%", "At limit"],
		],
		[
			"budget:transportation",
			[
				"Transportation",
				"₹2,000.00",
				"₹1,800.00",
				"₹200.00",
				"90.0%",
				"Nearing limit",
			],
		],
	])("%s reads its figures and state", (key, expected) => {
		renderTable({ view: OCTOBER });
		expect(cells(key)).toEqual(expected);
	});

	test("Budgeted total reads the overall figures and state (13,168.00 of 11,000.00)", () => {
		renderTable({ view: OCTOBER });
		expect(cells("total")).toEqual([
			"Budgeted total",
			"₹11,000.00",
			"₹13,168.00",
			"−₹2,168.00",
			"119.7%",
			"Over budget",
		]);
		expect(rowOf("total")).toHaveClass("font-bold");
	});

	test("a Not budgeted row has dashes for what it lacks, and the state Not budgeted", () => {
		renderTable({ view: OCTOBER });
		expect(cells("unbudgeted:housing")).toEqual([
			"Housing",
			"—",
			"₹18,000.00",
			"—",
			"—",
			"Not budgeted",
		]);
		expect(rowOf("unbudgeted:housing")).toHaveClass("text-ink-2");
	});

	test("the category is each row's header", () => {
		renderTable({ view: OCTOBER });
		expect(
			within(rowOf("budget:food")).getByRole("rowheader"),
		).toHaveTextContent("Food");
	});

	test("states take their colour as well as their words; an amount over the limit is red", () => {
		renderTable({ view: OCTOBER });
		expect(within(rowOf("budget:food")).getByText("Over budget")).toHaveClass(
			"text-neg",
		);
		expect(within(rowOf("budget:shopping")).getByText("At limit")).toHaveClass(
			"text-warn",
		);
		expect(
			within(rowOf("budget:transportation")).getByText("Nearing limit"),
		).toHaveClass("text-warn");
		expect(within(rowOf("budget:food")).getByText("−₹1,220.00")).toHaveClass(
			"text-neg",
		);
		expect(
			within(rowOf("total")).getByText("Over budget").closest("td"),
		).toHaveClass("text-neg");
	});

	test("the figures' columns are aligned right, the words left", () => {
		renderTable({ view: OCTOBER });
		expect(heading("Spent")).toHaveClass("text-right");
		expect(heading("Category")).toHaveClass("text-left");
		expect(heading("State")).toHaveClass("text-left");
		const [category, limit, , , , state] = cellsOf(rowOf("budget:food"));
		expect(limit).toHaveClass("text-right");
		expect(category).not.toHaveClass("text-right");
		expect(state).not.toHaveClass("text-right");
	});
});

describe("golden September (F04 section 5)", () => {
	test("three Budgets, the total Nearing limit, and three Not budgeted rows by spending", () => {
		renderTable({ view: SEPTEMBER });
		expect(order()).toEqual([
			"budget:food",
			"budget:shopping",
			"budget:entertainment",
			"total",
			"unbudgeted:housing",
			"unbudgeted:health",
			"unbudgeted:transportation",
		]);
		expect(cells("total")).toEqual([
			"Budgeted total",
			"₹10,000.00",
			"₹8,099.00",
			"₹1,901.00",
			"81.0%",
			"Nearing limit",
		]);
		expect(cells("budget:entertainment")).toEqual([
			"Entertainment",
			"₹1,000.00",
			"₹649.00",
			"₹351.00",
			"64.9%",
			"On track",
		]);
		expect(cells("unbudgeted:transportation")).toEqual([
			"Transportation",
			"—",
			"₹450.00",
			"—",
			"—",
			"Not budgeted",
		]);
		expect(
			screen.getByRole("grid", {
				name: "September 2026. Select a column heading to sort.",
			}),
		).toBeVisible();
	});
});

describe("sorting (BR-F04-18)", () => {
	test("no heading is sorted at first", () => {
		renderTable({ view: OCTOBER });
		for (const cell of within(grid()).getAllByRole("columnheader")) {
			expect(cell).toHaveAttribute("aria-sort", "none");
		}
	});

	test.each([
		[
			"Category",
			"ascending",
			["entertainment", "food", "shopping", "transportation"],
		],
		[
			"Limit",
			"descending",
			["food", "shopping", "transportation", "entertainment"],
		],
		[
			"Spent",
			"descending",
			["food", "shopping", "entertainment", "transportation"],
		],
		[
			"Remaining",
			"descending",
			["transportation", "shopping", "entertainment", "food"],
		],
		[
			"Utilization",
			"descending",
			["entertainment", "food", "shopping", "transportation"],
		],
		// Over budget first; entertainment and food tie and keep the month's order.
		[
			"State",
			"ascending",
			["entertainment", "food", "shopping", "transportation"],
		],
	])("pressing %s sorts %s first", async (name, direction, expected) => {
		const { user } = renderTable({ view: OCTOBER });
		await user.click(heading(name));
		expect(heading(name)).toHaveAttribute("aria-sort", direction);
		expect(order()).toEqual([
			...expected.map((category) => `budget:${category}`),
			"total",
			"unbudgeted:housing",
		]);
	});

	test.each([
		[
			"Category",
			"descending",
			["transportation", "shopping", "food", "entertainment"],
		],
		[
			"Limit",
			"ascending",
			["entertainment", "transportation", "shopping", "food"],
		],
		[
			"Spent",
			"ascending",
			["transportation", "entertainment", "shopping", "food"],
		],
		[
			"Remaining",
			"ascending",
			["food", "entertainment", "shopping", "transportation"],
		],
		[
			"Utilization",
			"ascending",
			["transportation", "shopping", "food", "entertainment"],
		],
		// Nearing limit first; the tie keeps the month's order.
		[
			"State",
			"descending",
			["transportation", "shopping", "entertainment", "food"],
		],
	])("pressing %s again reverses it to %s", async (name, direction, expected) => {
		const { user } = renderTable({ view: OCTOBER });
		await user.click(heading(name));
		await user.click(heading(name));
		expect(heading(name)).toHaveAttribute("aria-sort", direction);
		expect(order()).toEqual([
			...expected.map((category) => `budget:${category}`),
			"total",
			"unbudgeted:housing",
		]);
	});

	test("a third press brings back the month's order, and a fourth starts again", async () => {
		const { user } = renderTable({ view: OCTOBER });
		await user.click(heading("Spent"));
		await user.click(heading("Spent"));
		await user.click(heading("Spent"));
		expect(heading("Spent")).toHaveAttribute("aria-sort", "none");
		expect(order()).toEqual(MONTH_ORDER);
		await user.click(heading("Spent"));
		expect(heading("Spent")).toHaveAttribute("aria-sort", "descending");
	});

	test("Category's third press brings the month's order back too", async () => {
		const { user } = renderTable({ view: OCTOBER });
		await user.click(heading("Category"));
		await user.click(heading("Category"));
		expect(heading("Category")).toHaveAttribute("aria-sort", "descending");
		await user.click(heading("Category"));
		expect(heading("Category")).toHaveAttribute("aria-sort", "none");
		expect(order()).toEqual(MONTH_ORDER);
	});

	test("one heading at a time: another starts at its own first direction", async () => {
		const { user } = renderTable({ view: OCTOBER });
		await user.click(heading("Spent"));
		await user.click(heading("Spent"));
		await user.click(heading("Category"));
		expect(heading("Category")).toHaveAttribute("aria-sort", "ascending");
		expect(heading("Spent")).toHaveAttribute("aria-sort", "none");
		await user.click(heading("Limit"));
		expect(heading("Limit")).toHaveAttribute("aria-sort", "descending");
		expect(heading("Category")).toHaveAttribute("aria-sort", "none");
	});

	test("every heading shows it can sort: an up-down mark, faint, hidden from screen readers", () => {
		renderTable({ view: OCTOBER });
		for (const cell of within(grid()).getAllByRole("columnheader")) {
			const icon = cell.querySelector("svg") as SVGElement;
			expect(icon).toHaveAttribute("data-sort-icon", "none");
			expect(icon).toHaveClass("lucide-chevrons-up-down", "text-ink-3");
			expect(icon).toHaveAttribute("aria-hidden", "true");
			expect(cell).toHaveClass(
				"cursor-pointer",
				"text-ink-2",
				"hover:text-ink",
			);
		}
		expect(heading("Spent")).toHaveAccessibleName("Spent");
	});

	test("the sorted heading turns accent with the arrow of its direction; the others keep the mark", async () => {
		const { user } = renderTable({ view: OCTOBER });
		const icon = (name: string) =>
			heading(name).querySelector("svg") as SVGElement;
		await user.click(heading("Spent"));
		expect(heading("Spent")).toHaveClass("text-accent");
		expect(heading("Spent")).not.toHaveClass("hover:text-ink");
		expect(icon("Spent")).toHaveAttribute("data-sort-icon", "descending");
		expect(icon("Spent")).toHaveClass("lucide-arrow-down");
		expect(icon("Spent")).not.toHaveClass("text-ink-3");
		await user.click(heading("Spent"));
		expect(icon("Spent")).toHaveAttribute("data-sort-icon", "ascending");
		expect(icon("Spent")).toHaveClass("lucide-arrow-up");
		expect(icon("Limit")).toHaveAttribute("data-sort-icon", "none");
		expect(heading("Limit")).toHaveClass("text-ink-2");
		await user.click(heading("Spent"));
		expect(icon("Spent")).toHaveAttribute("data-sort-icon", "none");
		expect(heading("Spent")).toHaveClass("text-ink-2");
	});

	test("Enter on a focused heading sorts too", async () => {
		const { user } = renderTable({ view: OCTOBER });
		await user.click(heading("Spent"));
		await user.keyboard("{ArrowRight}{Enter}");
		expect(heading("Remaining")).toHaveFocus();
		expect(heading("Remaining")).toHaveAttribute("aria-sort", "descending");
	});

	test("a sort stays when the month changes", async () => {
		const { user, rerender } = renderTable({ view: OCTOBER });
		await user.click(heading("Spent"));
		rerender(<Host view={SEPTEMBER} />);
		expect(heading("Spent")).toHaveAttribute("aria-sort", "descending");
		// September: food 5,050.00, shopping 2,400.00, entertainment 649.00.
		expect(order().slice(0, 3)).toEqual([
			"budget:food",
			"budget:shopping",
			"budget:entertainment",
		]);
	});
});

describe("selection (BR-F04-17)", () => {
	test("a press selects the row's category; a second press clears it", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, onSelect });
		await user.click(within(rowOf("budget:food")).getByText("Food"));
		expect(onSelect).toHaveBeenLastCalledWith("food");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		expect(cellsOf(rowOf("budget:food"))[0]).toHaveClass(
			"group-selected:bg-accent-soft",
		);
		await user.click(within(rowOf("budget:food")).getByText("Food"));
		expect(onSelect).toHaveBeenLastCalledWith(null);
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
	});

	test("a Not budgeted row selects its category", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, onSelect });
		await user.click(within(rowOf("unbudgeted:housing")).getByText("Housing"));
		expect(onSelect).toHaveBeenLastCalledWith("housing");
		expect(rowOf("unbudgeted:housing")).toHaveAttribute("aria-selected", "true");
	});

	test("Budgeted total selects nothing and keeps the selection", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, start: "food", onSelect });
		await user.click(within(rowOf("total")).getByText("Budgeted total"));
		expect(onSelect).not.toHaveBeenCalled();
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("total")).toHaveAttribute("aria-selected", "false");
		expect(rowOf("total")).not.toHaveAttribute("aria-disabled");
	});

	test("Enter and Space on a focused row select it", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, onSelect });
		rowOf("budget:shopping").focus();
		await user.keyboard("{Enter}");
		expect(onSelect).toHaveBeenLastCalledWith("shopping");
		await user.keyboard(" ");
		expect(onSelect).toHaveBeenLastCalledWith(null);
	});

	test("one category at a time", async () => {
		const { user } = renderTable({ view: OCTOBER, start: "food" });
		await user.click(within(rowOf("budget:shopping")).getByText("Shopping"));
		expect(rowOf("budget:shopping")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
	});

	test("a selection the caller gives shows, sorted or not", async () => {
		const { user } = renderTable({ view: OCTOBER, start: "transportation" });
		expect(rowOf("budget:transportation")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await user.click(heading("Category"));
		expect(rowOf("budget:transportation")).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	test("a selected category the table doesn't show leaves every row unselected", () => {
		renderTable({ view: OCTOBER, start: "health" });
		for (const row of within(grid()).getAllByRole("row").slice(1)) {
			expect(row).toHaveAttribute("aria-selected", "false");
		}
	});

	test("Escape inside the table clears the selection (BR-F04-32)", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, start: "food", onSelect });
		rowOf("budget:food").focus();
		await user.keyboard("{Escape}");
		expect(onSelect).toHaveBeenLastCalledWith(null);
	});
});

describe("Up and Down (BR-F04-32)", () => {
	test("from nothing selected, Down selects and focuses the first row", async () => {
		const { user } = renderTable({ view: OCTOBER });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:entertainment")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(rowOf("budget:entertainment")).toHaveFocus();
	});

	test("they step through the rows shown, skipping Budgeted total, into Not budgeted", async () => {
		const { user } = renderTable({ view: OCTOBER, start: "transportation" });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("unbudgeted:housing")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("unbudgeted:housing")).toHaveFocus();
		await user.keyboard("{ArrowUp}");
		expect(rowOf("budget:transportation")).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	test("they follow the sorted order", async () => {
		const { user } = renderTable({ view: OCTOBER });
		await user.click(heading("Spent"));
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:shopping")).toHaveAttribute("aria-selected", "true");
	});

	test("inside the table they select too, from the focused row or cell", async () => {
		const { user } = renderTable({ view: OCTOBER });
		rowOf("budget:food").focus();
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:shopping")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("budget:shopping")).toHaveFocus();
		await user.keyboard("{ArrowRight}");
		await user.keyboard("{ArrowUp}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("budget:food")).toHaveFocus();
	});

	test("Up from the first row reaches the headings, without changing the selection", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, onSelect });
		rowOf("budget:entertainment").focus();
		await user.keyboard("{ArrowUp}");
		expect(document.activeElement).toHaveAttribute("role", "columnheader");
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("so a keyboard alone can sort: Up to the headings, Right along them, Enter", async () => {
		const { user } = renderTable({ view: OCTOBER });
		rowOf("budget:entertainment").focus();
		await user.keyboard("{ArrowUp}");
		const headings = within(grid()).getAllByRole("columnheader");
		const from = headings.indexOf(document.activeElement as HTMLElement);
		for (let at = from; at < 2; at++) await user.keyboard("{ArrowRight}");
		for (let at = from; at > 2; at--) await user.keyboard("{ArrowLeft}");
		expect(heading("Spent")).toHaveFocus();
		await user.keyboard("{Enter}");
		expect(heading("Spent")).toHaveAttribute("aria-sort", "descending");
	});

	test("Up on a heading stays there; Down from a heading selects the first row shown", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, start: "shopping", onSelect });
		await user.click(heading("Spent"));
		await user.keyboard("{ArrowUp}");
		expect(heading("Spent")).toHaveFocus();
		expect(onSelect).not.toHaveBeenCalled();
		await user.keyboard("{ArrowDown}");
		// Sorted by Spent: food first.
		expect(onSelect).toHaveBeenLastCalledWith("food");
		expect(rowOf("budget:food")).toHaveFocus();
	});

	test("the ends stay put", async () => {
		const { user } = renderTable({ view: OCTOBER, start: "entertainment" });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowUp}");
		expect(rowOf("budget:entertainment")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		rowOf("unbudgeted:housing").focus();
		await user.keyboard("{ArrowDown}");
		expect(rowOf("unbudgeted:housing")).toHaveAttribute("aria-selected", "true");
	});

	test("under a filter, only the rows shown are stepped through", async () => {
		const { user } = renderTable({ view: OCTOBER, startFilter: "over" });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
	});

	test("the keys do nothing in a text field", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, onSelect });
		await user.click(screen.getByRole("textbox", { name: "Search" }));
		await user.keyboard("{ArrowDown}");
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("letters do not jump to a row, since they are the page's shortcuts", async () => {
		const { user } = renderTable({ view: OCTOBER });
		rowOf("budget:entertainment").focus();
		await user.keyboard("fs");
		expect(rowOf("budget:entertainment")).toHaveFocus();
	});
});

describe("Up and Down below 1180 px (BR-F04-32, D-571)", () => {
	test("in the focus mode they move focus through the rows without selecting", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, arrows: "focus", onSelect });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:entertainment")).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:food")).toHaveFocus();
		await user.keyboard("{ArrowUp}");
		expect(rowOf("budget:entertainment")).toHaveFocus();
		expect(onSelect).not.toHaveBeenCalled();
		expect(rowOf("budget:entertainment")).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});

	test("in the focus mode Enter still selects", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, arrows: "focus", onSelect });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("food");
	});

	test("off, while the drawer is open, they do nothing", async () => {
		const onSelect = vi.fn();
		const { user } = renderTable({ view: OCTOBER, arrows: "off", onSelect });
		const before = screen.getByRole("button", { name: "Before" });
		await user.click(before);
		await user.keyboard("{ArrowDown}");
		expect(before).toHaveFocus();
		expect(onSelect).not.toHaveBeenCalled();
	});
});

describe("the state filter (BR-F04-18, BR-F04-31, D-249)", () => {
	// AC-F04-26
	test("Over budget shows entertainment and food with Budgeted total, and no housing", () => {
		renderTable({ view: OCTOBER, startFilter: "over" });
		expect(order()).toEqual(["budget:entertainment", "budget:food", "total"]);
		expect(cells("total").slice(1, 3)).toEqual(["₹11,000.00", "₹13,168.00"]);
		expect(screen.getByText("Showing")).toBeVisible();
		expect(screen.getByRole("button", { name: "Show all" })).toBeVisible();
	});

	test("At limit stays apart from Over budget", () => {
		renderTable({ view: OCTOBER, startFilter: "at" });
		expect(order()).toEqual(["budget:shopping", "total"]);
	});

	// AC-F04-26
	test("On track shows the empty text in place of the table, with Show all Budgets", async () => {
		const onFilterChange = vi.fn();
		const { user } = renderTable({
			view: OCTOBER,
			startFilter: "ok",
			onFilterChange,
		});
		expect(
			screen.getByText("No Budgets are on track in October 2026."),
		).toBeVisible();
		expect(
			screen.queryByRole("grid", { name: /Select a column heading/ }),
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Show all Budgets" }));
		expect(onFilterChange).toHaveBeenLastCalledWith(null);
		expect(order()).toEqual(MONTH_ORDER);
	});

	test("Show all clears it, and every row comes back", async () => {
		const { user } = renderTable({ view: OCTOBER, startFilter: "over" });
		await user.click(screen.getByRole("button", { name: "Show all" }));
		expect(order()).toEqual(MONTH_ORDER);
		expect(screen.queryByText("Showing")).not.toBeInTheDocument();
	});

	test("a sort applies within the filter", async () => {
		const { user } = renderTable({ view: OCTOBER, startFilter: "over" });
		await user.click(heading("Spent"));
		expect(order()).toEqual(["budget:food", "budget:entertainment", "total"]);
	});
});

describe("other formats", () => {
	test("figures and month follow the profile's formats", () => {
		renderTable({
			view: OCTOBER,
			formats: { currency: "INR", numberLocale: "de-DE", dateLocale: "de-DE" },
		});
		expect(
			screen.getByRole("grid", {
				name: "Oktober 2026. Select a column heading to sort.",
			}),
		).toBeVisible();
		expect(cells("budget:food").slice(1, 5)).toEqual([
			// de-DE puts a non-breaking space before the symbol and the percent sign.
			"5.000,00\u00a0₹",
			"6.220,00\u00a0₹",
			"−1.220,00\u00a0₹",
			"124,4 %",
		]);
	});
});

describe("look", () => {
	const RING = [
		"outline-none",
		"focus-visible:outline-2",
		"focus-visible:-outline-offset-2",
		"focus-visible:outline-solid",
		"focus-visible:outline-focus",
		"focus-visible:rounded-control",
	];

	test("headings and cells draw their focus ring inside, rounded, so the scroll box can't clip it", () => {
		renderTable({ view: OCTOBER });
		expect(heading("Spent")).toHaveClass(...RING);
		for (const key of ["budget:food", "total", "unbudgeted:housing"]) {
			for (const cell of cellsOf(rowOf(key)))
				expect(cell).toHaveClass(...RING);
		}
	});

	test("a focused row's ring is drawn on its cells, closed at both ends; the row draws none", () => {
		renderTable({ view: OCTOBER });
		for (const key of ["budget:food", "total", "unbudgeted:housing"]) {
			expect(rowOf(key)).toHaveClass("group", "outline-none");
			expect(rowOf(key)).not.toHaveClass("focus-visible:focus-ring");
			for (const cell of cellsOf(rowOf(key))) {
				expect(cell).toHaveClass(
					"group-focus-visible:shadow-[inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
					"group-focus-visible:first:shadow-[inset_2px_0_var(--color-focus),inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
					"group-focus-visible:last:shadow-[inset_-2px_0_var(--color-focus),inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
				);
			}
		}
	});

	test("a selectable row's cells carry its hover and selection colour, with rounded ends", () => {
		renderTable({ view: OCTOBER });
		for (const key of ["budget:food", "unbudgeted:housing"]) {
			for (const cell of cellsOf(rowOf(key))) {
				expect(cell).toHaveClass(
					"group-hover:bg-soft",
					"group-selected:bg-accent-soft",
					"first:rounded-l-control",
					"last:rounded-r-control",
				);
			}
		}
		for (const cell of cellsOf(rowOf("total"))) {
			expect(cell).not.toHaveClass("group-hover:bg-soft");
			expect(cell).toHaveClass("border-t", "border-line-strong");
		}
	});

	test("the table keeps separate borders, so its cells can round", () => {
		renderTable({ view: OCTOBER });
		expect(grid()).toHaveClass("border-separate", "border-spacing-0");
	});

	test("a category sits as a block in its cell, centred like the figures", () => {
		renderTable({ view: OCTOBER });
		for (const key of ["budget:food", "unbudgeted:housing"]) {
			const tag = within(rowOf(key)).getByRole("rowheader")
				.firstElementChild as HTMLElement;
			expect(tag).toHaveClass("flex");
			expect(tag).not.toHaveClass("inline-flex");
		}
	});

	test("takes the caller's classes; the table keeps its width and scrolls sideways", () => {
		const { container } = renderTable({ view: OCTOBER, className: "mt-2" });
		expect(container.querySelector(".mt-2")).toContainElement(grid());
		expect(grid()).toHaveClass("min-w-160", "figures");
		expect(grid().parentElement).toHaveClass("overflow-x-auto");
	});
});
