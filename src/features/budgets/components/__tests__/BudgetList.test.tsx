import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { ExpenseCategory, StateLabel } from "@/lib/budgets/model";
import type { Formats } from "../../lib/labels";
import { monthAnswer } from "../../lib/__tests__/fixtures";
import type { BudgetMonthAnswer } from "../../lib/types";
import { BudgetList, type BudgetListProps } from "../BudgetList";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

/** The list with its selection and filter held as the page holds them. */
function Host({
	view,
	start = null,
	startFilter = null,
	...props
}: Partial<BudgetListProps> & {
	view: BudgetMonthAnswer;
	start?: ExpenseCategory | null;
	startFilter?: StateLabel | null;
}) {
	const [selected, setSelected] = useState<ExpenseCategory | null>(start);
	const [filter, setFilter] = useState<StateLabel | null>(startFilter);
	return (
		<>
			<button type="button">Before</button>
			<BudgetList
				view={view}
				formats={IN}
				todayShare={null}
				filter={filter}
				onFilterChange={(next) => {
					props.onFilterChange?.(next);
					setFilter(next);
				}}
				selected={selected}
				onSelect={(next) => {
					props.onSelect?.(next);
					setSelected(next);
				}}
				onAdd={props.onAdd ?? vi.fn()}
				onChangeLimit={props.onChangeLimit ?? vi.fn()}
				onDelete={props.onDelete ?? vi.fn()}
				{...(props.arrows ? { arrows: props.arrows } : {})}
			/>
			<input aria-label="Search" />
		</>
	);
}

function renderList(props: Parameters<typeof Host>[0]) {
	const view = render(<Host {...props} />);
	return { ...view, user: userEvent.setup() };
}

const OCTOBER = monthAnswer("2026-10");
const SEPTEMBER = monthAnswer("2026-09");

const main = () => screen.getByRole("grid", { name: "Budgets" });
const rowNames = (grid: HTMLElement) =>
	within(grid)
		.getAllByRole("row")
		.filter((row) => row.hasAttribute("data-key"))
		.map((row) => row.getAttribute("data-key"));
const rowOf = (key: string) =>
	document.querySelector<HTMLElement>(
		`[role="row"][data-key="${key}"]`,
	) as HTMLElement;

describe("golden October's groups (BR-F04-15, F04 section 5)", () => {
	test("Needs attention · 4, then Not budgeted · 1, in that order", () => {
		renderList({ view: OCTOBER });
		expect(rowNames(main())).toEqual([
			"budget:entertainment",
			"budget:food",
			"budget:shopping",
			"budget:transportation",
			"unbudgeted:housing",
		]);
		expect(screen.getByText("Needs attention · 4")).toBeVisible();
		expect(screen.getByText("₹2,368.00 over in total")).toBeVisible();
		expect(screen.getByText("Not budgeted · 1")).toBeVisible();
		expect(screen.queryByText(/^On track ·/)).not.toBeInTheDocument();
	});

	test("each Budget row reads its headline, figures, state and source", () => {
		renderList({ view: OCTOBER });
		const food = rowOf("budget:food");
		expect(food).toHaveTextContent("Food");
		expect(food).toHaveTextContent("Over by ₹1,220.00");
		expect(food).toHaveTextContent(
			"₹6,220.00 of ₹5,000.00 · 124.4% · Over budget",
		);
		expect(food).toHaveTextContent("₹5,000.00 from Oct 2026");
		expect(within(food).getByText("Over by ₹1,220.00")).toHaveClass("text-neg");
	});

	test("a row is named by its whole reading, the category first", () => {
		renderList({ view: OCTOBER });
		expect(
			screen.getByRole("row", {
				name: "Shopping, ₹0.00 left, ₹3,000.00 of ₹3,000.00 · 100.0% · At limit, ₹3,000.00 from Sept 2026",
			}),
		).toBeVisible();
	});

	test("At limit takes the warning colour, and its state is in words", () => {
		renderList({ view: OCTOBER });
		expect(within(rowOf("budget:shopping")).getByText("At limit")).toHaveClass(
			"text-warn",
		);
	});

	test("housing is Not budgeted with its spending, captioned for the month, with Add a Budget", () => {
		renderList({ view: OCTOBER });
		const housing = rowOf("unbudgeted:housing");
		expect(housing).toHaveTextContent("Housing");
		expect(housing).toHaveTextContent("No limit in October");
		expect(housing).toHaveTextContent("₹18,000.00");
		expect(
			within(housing).getByRole("button", { name: "Add a Budget" }),
		).toBeVisible();
	});

	test("the bars carry today's marker only when given", () => {
		const { unmount } = renderList({ view: OCTOBER });
		expect(rowOf("budget:food").querySelector('[data-part="today"]')).toBeNull();
		unmount();
		render(
			<BudgetList
				view={monthAnswer("2026-11")}
				formats={IN}
				todayShare={2 / 30}
				filter={null}
				onFilterChange={vi.fn()}
				selected={null}
				onSelect={vi.fn()}
				onAdd={vi.fn()}
				onChangeLimit={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);
		expect(
			rowOf("budget:food").querySelector('[data-part="today"]'),
		).not.toBeNull();
	});
});

describe("today's marker on every group's bars", () => {
	test("rows needing attention and rows on track both carry it when given", () => {
		render(
			<BudgetList
				view={SEPTEMBER}
				formats={IN}
				todayShare={0.5}
				filter={null}
				onFilterChange={vi.fn()}
				selected={null}
				onSelect={vi.fn()}
				onAdd={vi.fn()}
				onChangeLimit={vi.fn()}
				onDelete={vi.fn()}
			/>,
		);
		for (const key of ["budget:food", "budget:entertainment"]) {
			expect(rowOf(key).querySelector('[data-part="today"]')).not.toBeNull();
		}
	});
});

describe("golden September's groups (F04 section 5)", () => {
	test("Needs attention · 2, On track · 1, Not budgeted · 3, with their figures", () => {
		renderList({ view: SEPTEMBER });
		expect(rowNames(main())).toEqual([
			"budget:food",
			"budget:shopping",
			"budget:entertainment",
			"unbudgeted:housing",
			"unbudgeted:health",
			"unbudgeted:transportation",
		]);
		expect(screen.getByText("₹1,550.00 left")).toBeVisible();
		expect(screen.getByText("On track · 1").parentElement).toHaveTextContent(
			"On track · 1 ₹351.00 left",
		);
		expect(screen.getByText("Not budgeted · 3")).toBeVisible();
		expect(screen.getByText("₹19,950.00")).toBeVisible();
	});

	test("food's source names the next entry", () => {
		renderList({ view: SEPTEMBER });
		expect(rowOf("budget:food")).toHaveTextContent(
			"₹6,000.00 from Sept 2026, then ₹5,000.00 from Oct 2026",
		);
	});

	// AC-F04-13: transportation has a Budget record, so its action is Change limit.
	test("a Not budgeted category with a record offers Change limit; without one, Add a Budget", async () => {
		const onAdd = vi.fn();
		const onChangeLimit = vi.fn();
		const { user } = renderList({ view: SEPTEMBER, onAdd, onChangeLimit });
		await user.click(
			within(rowOf("unbudgeted:transportation")).getByRole("button", {
				name: "Change limit",
			}),
		);
		await user.click(
			within(rowOf("unbudgeted:health")).getByRole("button", {
				name: "Add a Budget",
			}),
		);
		expect(onChangeLimit).toHaveBeenCalledWith("transportation");
		expect(onAdd).toHaveBeenCalledWith("health");
	});

	test("an action does not select its row", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: SEPTEMBER, onSelect });
		await user.click(
			within(rowOf("unbudgeted:health")).getByRole("button", {
				name: "Add a Budget",
			}),
		);
		expect(onSelect).not.toHaveBeenCalled();
	});
});

describe("Not active this month (BR-F04-15)", () => {
	test("is collapsed until pressed, with its count", async () => {
		const { user } = renderList({ view: SEPTEMBER });
		const toggle = screen.getByRole("button", {
			name: "Not active this month · 1",
		});
		expect(toggle).toHaveAttribute("aria-expanded", "false");
		expect(
			screen.queryByRole("grid", { name: "Not active this month" }),
		).toBeNull();
		await user.click(toggle);
		expect(toggle).toHaveAttribute("aria-expanded", "true");
		const grid = screen.getByRole("grid", { name: "Not active this month" });
		expect(rowNames(grid)).toEqual(["inactive:transportation"]);
	});

	test("lists why, with Change limit and Delete", async () => {
		const onChangeLimit = vi.fn();
		const onDelete = vi.fn();
		const { user } = renderList({ view: SEPTEMBER, onChangeLimit, onDelete });
		await user.click(
			screen.getByRole("button", { name: "Not active this month · 1" }),
		);
		const row = rowOf("inactive:transportation");
		expect(row).toHaveTextContent("Starts October 2026");
		await user.click(within(row).getByRole("button", { name: "Change limit" }));
		await user.click(within(row).getByRole("button", { name: "Delete" }));
		expect(onChangeLimit).toHaveBeenCalledWith("transportation");
		expect(onDelete).toHaveBeenCalledWith("transportation");
	});

	test("pressing it again collapses it", async () => {
		const { user } = renderList({ view: SEPTEMBER });
		const toggle = screen.getByRole("button", {
			name: "Not active this month · 1",
		});
		await user.click(toggle);
		await user.click(toggle);
		expect(toggle).toHaveAttribute("aria-expanded", "false");
	});

	test("does not show when every record has a limit", () => {
		renderList({ view: OCTOBER });
		expect(
			screen.queryByRole("button", { name: /Not active this month/ }),
		).not.toBeInTheDocument();
	});

	test("a month with only Not active records shows just that group", () => {
		renderList({
			view: { ...SEPTEMBER, budgets: [], unbudgeted: [] },
		});
		expect(
			screen.queryByRole("grid", { name: "Budgets" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Not active this month · 1" }),
		).toBeVisible();
	});
});

describe("the state filter (BR-F04-31)", () => {
	// AC-F04-26
	test("shows only that state, with the chip and Show all; Not budgeted and Not active hide", () => {
		renderList({ view: OCTOBER, startFilter: "over" });
		expect(rowNames(main())).toEqual(["budget:entertainment", "budget:food"]);
		expect(screen.getByText("Showing")).toBeVisible();
		expect(screen.getByRole("row", { name: "Over budget" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Show all" })).toBeVisible();
		expect(screen.queryByText(/^Not budgeted/)).not.toBeInTheDocument();
	});

	test("At limit stays apart from Over budget", () => {
		renderList({ view: OCTOBER, startFilter: "at" });
		expect(rowNames(main())).toEqual(["budget:shopping"]);
	});

	test("the group figure follows the rows shown", () => {
		renderList({ view: OCTOBER, startFilter: "warning" });
		expect(
			screen.getByText("Needs attention · 1").parentElement,
		).toHaveTextContent("Needs attention · 1 ₹200.00 left");
	});

	test("Not active hides under a filter", () => {
		renderList({ view: SEPTEMBER, startFilter: "warning" });
		expect(
			screen.queryByRole("button", { name: /Not active/ }),
		).not.toBeInTheDocument();
	});

	// AC-F04-26
	test("with no row in the state, the empty text and Show all Budgets", async () => {
		const onFilterChange = vi.fn();
		const { user } = renderList({
			view: OCTOBER,
			startFilter: "ok",
			onFilterChange,
		});
		expect(
			screen.getByText("No Budgets are on track in October 2026."),
		).toBeVisible();
		expect(
			screen.queryByRole("grid", { name: "Budgets" }),
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Show all Budgets" }));
		expect(onFilterChange).toHaveBeenLastCalledWith(null);
		expect(screen.getByText("Needs attention · 4")).toBeVisible();
	});

	test("Show all and the chip's remove button both clear it", async () => {
		const onFilterChange = vi.fn();
		const first = renderList({
			view: OCTOBER,
			startFilter: "over",
			onFilterChange,
		});
		await first.user.click(screen.getByRole("button", { name: "Show all" }));
		expect(onFilterChange).toHaveBeenLastCalledWith(null);
		first.unmount();
		const second = renderList({
			view: OCTOBER,
			startFilter: "over",
			onFilterChange,
		});
		await second.user.click(screen.getByRole("button", { name: /^Remove/ }));
		expect(onFilterChange).toHaveBeenLastCalledWith(null);
	});
});

describe("selection (BR-F04-17)", () => {
	test("a press selects the row's category; a second press clears it", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: OCTOBER, onSelect });
		await user.click(rowOf("budget:food"));
		expect(onSelect).toHaveBeenLastCalledWith("food");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
		await user.click(rowOf("budget:food"));
		expect(onSelect).toHaveBeenLastCalledWith(null);
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
	});

	test("Enter and Space on a focused row select it", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: OCTOBER, onSelect });
		await user.tab();
		await user.tab();
		await user.keyboard(" ");
		expect(onSelect).toHaveBeenLastCalledWith("entertainment");
	});

	test("one category at a time: selecting another moves the selection", async () => {
		const { user } = renderList({ view: OCTOBER });
		await user.click(rowOf("budget:food"));
		await user.click(rowOf("unbudgeted:housing"));
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
		expect(rowOf("unbudgeted:housing")).toHaveAttribute("aria-selected", "true");
	});

	test("a category under Not budgeted and Not active is selected in both", async () => {
		const { user } = renderList({ view: SEPTEMBER });
		await user.click(
			screen.getByRole("button", { name: "Not active this month · 1" }),
		);
		await user.click(rowOf("unbudgeted:transportation"));
		expect(rowOf("inactive:transportation")).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	test("a Not active row selects its category, and a second press clears it", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: SEPTEMBER, onSelect });
		await user.click(
			screen.getByRole("button", { name: "Not active this month · 1" }),
		);
		await user.click(
			within(rowOf("inactive:transportation")).getByText("Transportation"),
		);
		expect(onSelect).toHaveBeenLastCalledWith("transportation");
		expect(rowOf("unbudgeted:transportation")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await user.click(
			within(rowOf("inactive:transportation")).getByText("Transportation"),
		);
		expect(onSelect).toHaveBeenLastCalledWith(null);
	});

	test("a selection the caller gives shows", () => {
		renderList({ view: OCTOBER, start: "shopping" });
		expect(rowOf("budget:shopping")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("budget:shopping")).toHaveClass("selected:bg-accent-soft");
	});
});

describe("Up and Down (BR-F04-32)", () => {
	test("from nothing selected, Down selects and focuses the first row", async () => {
		const { user } = renderList({ view: OCTOBER });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:entertainment")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(rowOf("budget:entertainment")).toHaveFocus();
	});

	test("Down and Up move the selection through the rows in order, across groups", async () => {
		const { user } = renderList({ view: OCTOBER, start: "transportation" });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("unbudgeted:housing")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("unbudgeted:housing")).toHaveFocus();
		await user.keyboard("{ArrowUp}{ArrowUp}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "false");
		expect(rowOf("budget:shopping")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("budget:shopping")).toHaveFocus();
	});

	test("inside the list the keys select too, moving from the focused row", async () => {
		const { user } = renderList({ view: OCTOBER });
		await user.click(rowOf("budget:food"));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("budget:shopping")).toHaveAttribute("aria-selected", "true");
		expect(rowOf("budget:shopping")).toHaveFocus();
		await user.keyboard("{ArrowUp}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
	});

	test("the ends stay put", async () => {
		const { user } = renderList({ view: OCTOBER, start: "entertainment" });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowUp}");
		expect(rowOf("budget:entertainment")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await user.click(rowOf("unbudgeted:housing"));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("unbudgeted:housing")).toHaveAttribute("aria-selected", "true");
	});

	test("an expanded Not active group joins the rows, from either list", async () => {
		const { user } = renderList({ view: SEPTEMBER, start: "transportation" });
		await user.click(
			screen.getByRole("button", { name: "Not active this month · 1" }),
		);
		await user.click(rowOf("unbudgeted:transportation"));
		await user.click(rowOf("unbudgeted:transportation"));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("inactive:transportation")).toHaveFocus();
		await user.keyboard("{ArrowUp}");
		expect(rowOf("unbudgeted:transportation")).toHaveFocus();
	});

	test("a collapsed Not active group is skipped", async () => {
		const { user } = renderList({ view: SEPTEMBER });
		await user.click(rowOf("unbudgeted:transportation"));
		await user.keyboard("{ArrowDown}");
		expect(rowOf("unbudgeted:transportation")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(rowOf("unbudgeted:transportation")).toHaveFocus();
	});

	test("under a filter, only the rows shown are stepped through", async () => {
		const { user } = renderList({
			view: OCTOBER,
			startFilter: "over",
			start: "entertainment",
		});
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}{ArrowDown}");
		expect(rowOf("budget:food")).toHaveAttribute("aria-selected", "true");
	});

	test("the keys do nothing in a text field", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: OCTOBER, onSelect });
		await user.click(screen.getByRole("textbox", { name: "Search" }));
		await user.keyboard("{ArrowDown}");
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("with no rows, the keys do nothing", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: OCTOBER, startFilter: "ok", onSelect });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}");
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("letters do not jump to a row, since they are the page's shortcuts", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: OCTOBER, onSelect });
		await user.click(rowOf("budget:entertainment"));
		onSelect.mockClear();
		await user.keyboard("s");
		expect(rowOf("budget:shopping")).not.toHaveFocus();
	});
});

describe("Up and Down below 1180 px (BR-F04-32, D-571)", () => {
	test("in the focus mode they move focus through the rows without selecting", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: OCTOBER, arrows: "focus", onSelect });
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
		const { user } = renderList({ view: OCTOBER, arrows: "focus", onSelect });
		await user.click(screen.getByRole("button", { name: "Before" }));
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("food");
	});

	test("off, while the drawer is open, they do nothing", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: OCTOBER, arrows: "off", onSelect });
		const before = screen.getByRole("button", { name: "Before" });
		await user.click(before);
		await user.keyboard("{ArrowDown}");
		expect(before).toHaveFocus();
		expect(onSelect).not.toHaveBeenCalled();
	});
});

describe("Escape inside the list (BR-F04-32)", () => {
	test("clears the selection", async () => {
		const onSelect = vi.fn();
		const { user } = renderList({ view: OCTOBER, onSelect });
		await user.click(rowOf("budget:food"));
		await user.keyboard("{Escape}");
		expect(onSelect).toHaveBeenLastCalledWith(null);
	});
});

describe("look", () => {
	test("takes the caller's classes", () => {
		const { container } = render(
			<BudgetList
				view={OCTOBER}
				formats={IN}
				todayShare={null}
				filter={null}
				onFilterChange={vi.fn()}
				selected={null}
				onSelect={vi.fn()}
				onAdd={vi.fn()}
				onChangeLimit={vi.fn()}
				onDelete={vi.fn()}
				className="mt-3"
			/>,
		);
		expect(container.firstElementChild).toHaveClass("mt-3");
	});
});
