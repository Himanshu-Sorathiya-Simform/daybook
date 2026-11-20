import type { SortingState } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { RowArrows } from "@/hooks/useRowArrows";
import { DEFAULT_SORTING } from "../../lib/table";
import type { SubscriptionList } from "../../lib/types";
import { subscriptionItem, subscriptionList } from "../../lib/__tests__/fixtures";
import {
	SubscriptionTable,
	type SubscriptionTableProps,
} from "../SubscriptionTable";
import { endedOn, FORMATS, made } from "./rows";

const GOLDEN = subscriptionList();
const [NETFLIX, CULT, SUNRISE, PRIME] = GOLDEN.items;

type Setup = Partial<SubscriptionTableProps> & {
	list?: Pick<SubscriptionList, "items" | "totals">;
	sorting?: SortingState;
	selected?: string | null;
	arrows?: RowArrows;
};

/** The table with the page's state around it: its sort and its selection. */
function setup({
	list = GOLDEN,
	sorting = DEFAULT_SORTING,
	selected = null,
	arrows,
	...rest
}: Setup = {}) {
	const picks: (string | null)[] = [];
	const sorts: SortingState[] = [];
	function Harness() {
		const [sort, setSort] = useState(sorting);
		const [chosen, setChosen] = useState(selected);
		sorts.length = 0;
		sorts.push(sort);
		return (
			<SubscriptionTable
				list={list}
				formats={FORMATS}
				sorting={sort}
				onSortingChange={setSort}
				selected={chosen}
				onSelect={(id) => {
					picks.push(id);
					setChosen(id);
				}}
				{...(arrows === undefined ? {} : { arrows })}
				{...rest}
			/>
		);
	}
	render(<Harness />);
	return { picks, sorts, user: userEvent.setup() };
}

const heading = (name: string) =>
	screen.getByRole("columnheader", { name: new RegExp(`^${name}`) });
/** The table's own rows, not the filter chip's. */
const tableRowsOf = () =>
	within(screen.getByRole("grid", { name: /^Ended Subscriptions/ })).getAllByRole(
		"row",
	);
const bodyRows = () => tableRowsOf().slice(1, -1);
const names = () =>
	bodyRows().map((row) => within(row).getByRole("rowheader").textContent);
const cellsOf = (row: HTMLElement) =>
	within(row)
		.getAllByRole("gridcell")
		.map((each) => each.textContent);
const rowNamed = (name: string) =>
	within(screen.getByRole("grid", { name: /^Ended Subscriptions/ })).getByRole(
		"row",
		{ name: new RegExp(`^${name}`) },
	);

describe("the table on golden (BR-F05-39, AC-F05-35)", () => {
	// AC-F05-35
	test("is captioned, and the caption names it", () => {
		setup();
		const caption =
			"Ended Subscriptions aren't in the table or the totals. Select a column heading to sort.";
		expect(screen.getByText(caption)).toBeVisible();
		expect(screen.getByRole("grid", { name: caption })).toBeVisible();
	});

	test("heads the eight columns in order", () => {
		setup();
		expect(
			screen.getAllByRole("columnheader").map((head) => head.textContent),
		).toEqual([
			"Name",
			"Category",
			"Price",
			"Per month",
			"Share",
			"Per year",
			"Next due",
			"Status",
		]);
	});

	// AC-F05-35
	test("lists Sunrise Apartments, Cult Gym, Netflix and Amazon Prime, by Per month", () => {
		setup();
		expect(names()).toEqual([
			"Sunrise Apartments",
			"Cult Gym",
			"Netflix",
			"Amazon Prime",
		]);
	});

	// AC-F05-35
	test("gives their shares 88.8%, 7.4%, 3.2% and 0.6%", () => {
		setup();
		expect(bodyRows().map((row) => cellsOf(row)[3])).toEqual([
			"88.8%",
			"7.4%",
			"3.2%",
			"0.6%",
		]);
	});

	test("writes every cell of a row", () => {
		setup();
		expect(cellsOf(rowNamed("Netflix"))).toEqual([
			"Entertainment",
			"₹649.00 a month",
			"₹649.00",
			"3.2%",
			"₹7,788.00",
			"5 Nov",
			"Active",
		]);
	});

	test("shows a bar for each share, as long as the share", () => {
		setup();
		const fill = (name: string) =>
			rowNamed(name).querySelector<HTMLElement>("span.bg-track > span")!;
		expect(fill("Sunrise").style.width).toBe("88.8%");
		expect(fill("Netflix").style.width).toBe("3.2%");
	});

	test("the bar is hidden from screen readers; the percentage is the text", () => {
		setup();
		expect(rowNamed("Sunrise").querySelector("span.bg-track")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	// AC-F05-35
	test("ends with Total · 4 and the monthly and yearly totals", () => {
		setup();
		const total = tableRowsOf().at(-1)!;
		expect(total).toHaveTextContent("Total · 4");
		expect(cellsOf(total).filter(Boolean)).toEqual([
			"₹20,273.92",
			"₹2,43,287.00",
		]);
	});

	test("the Total row is not selectable", async () => {
		const { picks, user } = setup();
		await user.click(tableRowsOf().at(-1)!);
		expect(picks).toEqual([]);
	});

	test("the name is the row's header", () => {
		setup();
		expect(within(rowNamed("Netflix")).getByRole("rowheader")).toHaveTextContent(
			"Netflix",
		);
	});

	test("the figures are aligned right and the text left", () => {
		setup();
		expect(heading("Per month")).toHaveClass("text-right");
		expect(heading("Price")).toHaveClass("text-right");
		expect(heading("Name")).toHaveClass("text-left");
		expect(heading("Share")).toHaveClass("text-left");
	});
});

describe("sorting (BR-F05-39, D-570)", () => {
	// AC-F05-35
	test("starts sorted by Per month, largest first, said by aria-sort", () => {
		setup();
		expect(heading("Per month")).toHaveAttribute("aria-sort", "descending");
		for (const other of [
			"Name",
			"Category",
			"Price",
			"Share",
			"Per year",
			"Next due",
			"Status",
		]) {
			expect(heading(other)).toHaveAttribute("aria-sort", "none");
		}
	});

	test("the sorted heading shows its arrow and the others an up-down mark", () => {
		setup();
		expect(
			heading("Per month").querySelector("[data-sort-icon]"),
		).toHaveAttribute("data-sort-icon", "descending");
		expect(heading("Name").querySelector("[data-sort-icon]")).toHaveAttribute(
			"data-sort-icon",
			"none",
		);
	});

	test("a text column sorts ascending first", async () => {
		const { user } = setup();
		await user.click(heading("Name"));
		expect(names()).toEqual([
			"Amazon Prime",
			"Cult Gym",
			"Netflix",
			"Sunrise Apartments",
		]);
		expect(heading("Name")).toHaveAttribute("aria-sort", "ascending");
		expect(heading("Per month")).toHaveAttribute("aria-sort", "none");
	});

	test("pressing it again reverses it", async () => {
		const { user } = setup();
		await user.click(heading("Name"));
		await user.click(heading("Name"));
		expect(names()[0]).toBe("Sunrise Apartments");
		expect(heading("Name")).toHaveAttribute("aria-sort", "descending");
	});

	test("a third press brings back the default sort, Per month, largest first", async () => {
		const { user } = setup();
		await user.click(heading("Name"));
		await user.click(heading("Name"));
		await user.click(heading("Name"));
		expect(heading("Name")).toHaveAttribute("aria-sort", "none");
		expect(heading("Per month")).toHaveAttribute("aria-sort", "descending");
		expect(names()).toEqual([
			"Sunrise Apartments",
			"Cult Gym",
			"Netflix",
			"Amazon Prime",
		]);
	});

	test("a fourth press starts that heading's cycle again", async () => {
		const { user } = setup();
		for (let press = 0; press < 4; press += 1) await user.click(heading("Name"));
		expect(heading("Name")).toHaveAttribute("aria-sort", "ascending");
		expect(names()[0]).toBe("Amazon Prime");
	});

	test("a figure's third press also brings back the default", async () => {
		const { user } = setup();
		await user.click(heading("Price"));
		await user.click(heading("Price"));
		expect(heading("Price")).toHaveAttribute("aria-sort", "ascending");
		await user.click(heading("Price"));
		expect(heading("Price")).toHaveAttribute("aria-sort", "none");
		expect(heading("Per month")).toHaveAttribute("aria-sort", "descending");
	});

	test("the default's own heading cycles between its two directions", async () => {
		const { user } = setup();
		await user.click(heading("Per month"));
		expect(heading("Per month")).toHaveAttribute("aria-sort", "ascending");
		await user.click(heading("Per month"));
		expect(heading("Per month")).toHaveAttribute("aria-sort", "descending");
		expect(names()[0]).toBe("Sunrise Apartments");
	});

	test("the default is reached from a sort the page was given", async () => {
		const { user } = setup({ sorting: [{ id: "name", desc: true }] });
		await user.click(heading("Name"));
		expect(heading("Name")).toHaveAttribute("aria-sort", "none");
		expect(heading("Per month")).toHaveAttribute("aria-sort", "descending");
	});

	test("the page is told the default, so its state is never empty", async () => {
		const { sorts, user } = setup();
		await user.click(heading("Name"));
		await user.click(heading("Name"));
		await user.click(heading("Name"));
		expect(sorts[0]).toEqual([{ id: "perMonth", desc: true }]);
	});

	test("a figure sorts descending first", async () => {
		const { user } = setup();
		await user.click(heading("Price"));
		expect(heading("Price")).toHaveAttribute("aria-sort", "descending");
		expect(names()[0]).toBe("Sunrise Apartments");
		expect(names().at(-1)).toBe("Netflix");
	});

	test("Per month pressed once more flips it to smallest first", async () => {
		const { user } = setup();
		await user.click(heading("Per month"));
		expect(heading("Per month")).toHaveAttribute("aria-sort", "ascending");
		expect(names()).toEqual([
			"Amazon Prime",
			"Netflix",
			"Cult Gym",
			"Sunrise Apartments",
		]);
	});

	test("Per year sorts descending first", async () => {
		const { user } = setup();
		await user.click(heading("Per year"));
		expect(heading("Per year")).toHaveAttribute("aria-sort", "descending");
	});

	test("Next due sorts ascending first, soonest first", async () => {
		const { user } = setup();
		await user.click(heading("Next due"));
		expect(heading("Next due")).toHaveAttribute("aria-sort", "ascending");
		expect(names()).toEqual([
			"Netflix",
			"Cult Gym",
			"Sunrise Apartments",
			"Amazon Prime",
		]);
	});

	test("Share sorts as Per month, descending first", async () => {
		const { user } = setup();
		await user.click(heading("Name"));
		await user.click(heading("Share"));
		expect(heading("Share")).toHaveAttribute("aria-sort", "descending");
		expect(names()[0]).toBe("Sunrise Apartments");
	});

	test("Category sorts ascending first, by its words", async () => {
		const { user } = setup();
		await user.click(heading("Category"));
		expect(heading("Category")).toHaveAttribute("aria-sort", "ascending");
		expect(bodyRows().map((row) => cellsOf(row)[0])).toEqual([
			"Entertainment",
			"Entertainment",
			"Health",
			"Housing",
		]);
	});

	test("Status sorts ascending first, by its words", async () => {
		const { user } = setup();
		await user.click(heading("Status"));
		expect(heading("Status")).toHaveAttribute("aria-sort", "ascending");
	});

	test("Enter on a heading sorts by it", async () => {
		const { user } = setup();
		heading("Name").focus();
		await user.keyboard("{Enter}");
		expect(heading("Name")).toHaveAttribute("aria-sort", "ascending");
	});

	test("the page's sort is the one shown, so it survives the table being drawn again", () => {
		setup({ sorting: [{ id: "name", desc: true }] });
		expect(heading("Name")).toHaveAttribute("aria-sort", "descending");
		expect(names()[0]).toBe("Sunrise Apartments");
	});

	test("with no sort at all it falls back to Per month, largest first", () => {
		setup({ sorting: [] });
		expect(names()[0]).toBe("Sunrise Apartments");
		expect(heading("Per month")).toHaveAttribute("aria-sort", "none");
	});

	test("sorting leaves the Total row last", async () => {
		const { user } = setup();
		await user.click(heading("Name"));
		expect(tableRowsOf().at(-1)).toHaveTextContent("Total · 4");
	});
});

describe("a Subscription with no next due date (BR-F05-17, BR-F05-39)", () => {
	const quiet = made("Zeta", {
		status: "active",
		nextDueOn: null,
		monthlyMinor: 100,
		yearlyMinor: 1200,
	});
	const list = {
		items: [...GOLDEN.items, quiet],
		totals: GOLDEN.totals,
	};

	test("shows its costs and a dash as Share and Next due", () => {
		setup({ list });
		const cells = cellsOf(rowNamed("Zeta"));
		expect(cells[3]).toBe("—");
		expect(cells[5]).toBe("—");
		expect(cells[2]).toBe("₹1.00");
		expect(cells[4]).toBe("₹12.00");
	});

	test("has no share bar", () => {
		setup({ list });
		expect(rowNamed("Zeta").querySelector("span.bg-track")).toBeNull();
	});

	test("sorts last by Next due ascending", async () => {
		const { user } = setup({ list });
		await user.click(heading("Next due"));
		expect(names().at(-1)).toBe("Zeta");
	});

	test("and last by Next due descending", async () => {
		const { user } = setup({ list });
		await user.click(heading("Next due"));
		await user.click(heading("Next due"));
		expect(heading("Next due")).toHaveAttribute("aria-sort", "descending");
		expect(names().at(-1)).toBe("Zeta");
	});

	test("the Total row is the list's, which leaves it out", () => {
		setup({ list });
		expect(tableRowsOf().at(-1)).toHaveTextContent("Total · 4");
	});
});

describe("which Subscriptions are rows (BR-F05-39)", () => {
	test("an ended Subscription is not", () => {
		setup({
			list: {
				items: [...GOLDEN.items, endedOn("Old gym", "2026-08-01")],
				totals: GOLDEN.totals,
			},
		});
		expect(names()).not.toContain("Old gym");
		expect(bodyRows()).toHaveLength(4);
	});

	test("paused, ending and upcoming ones are, with their status in words", () => {
		setup({
			list: {
				items: [
					made("Paused one", { status: "paused" }),
					made("Ending one", { status: "ending", endDate: "2026-12-31" }),
					made("Soon one", { status: "upcoming" }),
				],
				totals: GOLDEN.totals,
			},
		});
		expect(cellsOf(rowNamed("Paused one")).at(-1)).toBe("Paused");
		expect(cellsOf(rowNamed("Ending one")).at(-1)).toBe("Ending");
		expect(cellsOf(rowNamed("Soon one")).at(-1)).toBe("Starts soon");
	});

	test("a Subscription in another year writes its next due date with the year", () => {
		setup({
			list: {
				items: [made("Far", { nextDueOn: "2027-10-12" })],
				totals: GOLDEN.totals,
			},
		});
		expect(cellsOf(rowNamed("Far"))[5]).toBe("12 Oct 2027");
	});

	test("with only ended Subscriptions the table gives way to a line saying so", () => {
		setup({
			list: {
				items: [endedOn("Old gym", "2026-08-01")],
				totals: GOLDEN.totals,
			},
		});
		expect(
			screen.getByText(
				"No running Subscriptions. Resume one in the List view.",
			),
		).toBeVisible();
		expect(screen.queryByRole("grid")).toBeNull();
		expect(screen.queryByText(/Ended Subscriptions aren't/)).toBeNull();
	});

	test("with no Subscription at all, the same line", () => {
		setup({ list: { items: [], totals: GOLDEN.totals } });
		expect(screen.getByText(/No running Subscriptions/)).toBeVisible();
	});
});

describe("the category filter (BR-F05-50, D-627)", () => {
	const narrowed = {
		items: [NETFLIX!, PRIME!],
		totals: GOLDEN.totals,
	};

	test("shows only the rows it is given, with Showing and the chip above", () => {
		setup({
			list: narrowed,
			category: "entertainment",
			onClearCategory: vi.fn(),
		});
		expect(names()).toEqual(["Netflix", "Amazon Prime"]);
		expect(screen.getByRole("grid", { name: "Showing" })).toHaveTextContent(
			"Entertainment",
		);
		expect(screen.getByRole("button", { name: "Show all" })).toBeVisible();
	});

	test("keeps the Total row and the shares those of every Subscription", () => {
		setup({
			list: narrowed,
			category: "entertainment",
			onClearCategory: vi.fn(),
		});
		expect(tableRowsOf().at(-1)).toHaveTextContent("Total · 4");
		expect(tableRowsOf().at(-1)).toHaveTextContent("₹20,273.92");
		expect(cellsOf(rowNamed("Netflix"))[3]).toBe("3.2%");
	});

	test("the chip and Show all clear the filter", async () => {
		const onClearCategory = vi.fn();
		const { user } = setup({
			list: narrowed,
			category: "entertainment",
			onClearCategory,
		});
		await user.click(screen.getByRole("button", { name: "Show all" }));
		await user.click(screen.getByRole("button", { name: /Remove/ }));
		expect(onClearCategory).toHaveBeenCalledTimes(2);
	});

	test("without a filter there is no chip row", () => {
		setup();
		expect(screen.queryByText("Showing")).toBeNull();
	});

	test("the chip row stays above the line when nothing is left to show", () => {
		setup({
			list: { items: [], totals: GOLDEN.totals },
			category: "health",
			onClearCategory: vi.fn(),
		});
		expect(screen.getByText("Showing")).toBeVisible();
		expect(screen.getByText(/No running Subscriptions/)).toBeVisible();
	});
});

describe("selection and the keys (BR-F05-45)", () => {
	test("pressing a row selects its Subscription", async () => {
		const { picks, user } = setup();
		await user.click(rowNamed("Netflix"));
		expect(picks).toEqual([NETFLIX!.id]);
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "true");
	});

	test("pressing it again clears it", async () => {
		const { picks, user } = setup();
		await user.click(rowNamed("Netflix"));
		await user.click(rowNamed("Netflix"));
		expect(picks).toEqual([NETFLIX!.id, null]);
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});

	test("pressing another row moves the selection", async () => {
		const { picks, user } = setup();
		await user.click(rowNamed("Netflix"));
		await user.click(rowNamed("Cult Gym"));
		expect(picks.at(-1)).toBe(CULT!.id);
		expect(rowNamed("Netflix")).toHaveAttribute("aria-selected", "false");
	});

	test("only the selected row reads as selected", () => {
		setup({ selected: SUNRISE!.id });
		const selected = bodyRows().filter(
			(row) => row.getAttribute("aria-selected") === "true",
		);
		expect(selected).toHaveLength(1);
		expect(selected[0]).toHaveTextContent("Sunrise");
	});

	test("a selection this table does not hold selects no row", () => {
		setup({ selected: "elsewhere" });
		expect(
			bodyRows().filter((row) => row.getAttribute("aria-selected") === "true"),
		).toHaveLength(0);
	});

	test("rows show a pointer", () => {
		setup();
		expect(rowNamed("Netflix")).toHaveClass("cursor-pointer");
	});

	test("Down selects the first row, then the next, in the order shown", async () => {
		const { picks, user } = setup();
		await user.keyboard("{ArrowDown}");
		await user.keyboard("{ArrowDown}");
		expect(picks).toEqual([SUNRISE!.id, CULT!.id]);
	});

	test("Up moves back", async () => {
		const { picks, user } = setup({ selected: NETFLIX!.id });
		await user.keyboard("{ArrowUp}");
		expect(picks).toEqual([CULT!.id]);
	});

	test("the keys follow the sort", async () => {
		const { picks, user } = setup();
		await user.click(heading("Name"));
		await user.keyboard("{ArrowDown}");
		expect(picks).toEqual([PRIME!.id]);
	});

	test("Down at the last row stays on it, never on the Total row", async () => {
		const { picks, user } = setup({ selected: PRIME!.id });
		await user.keyboard("{ArrowDown}");
		expect(picks.at(-1)).toBe(PRIME!.id);
	});

	test("in the focus mode they move focus and select nothing", async () => {
		const { picks, user } = setup({ arrows: "focus" });
		await user.keyboard("{ArrowDown}");
		expect(picks).toEqual([]);
		expect(rowNamed("Sunrise")).toHaveFocus();
	});

	test("off, they do nothing", async () => {
		const { picks, user } = setup({ arrows: "off" });
		await user.keyboard("{ArrowDown}");
		expect(picks).toEqual([]);
	});
});

describe("the table's own markup", () => {
	test("scrolls sideways rather than squeezing its columns", () => {
		setup();
		expect(screen.getByRole("grid").parentElement).toHaveClass(
			"overflow-x-auto",
		);
		expect(screen.getByRole("grid")).toHaveClass("min-w-215");
	});

	test("takes the caller's classes", () => {
		setup({ className: "mt-9" });
		expect(screen.getByRole("grid").closest("section")).toHaveClass("mt-9");
	});

	test("a row's ring is drawn inside it, so the scroll box never clips it", () => {
		setup();
		expect(within(rowNamed("Netflix")).getAllByRole("gridcell")[0]).toHaveClass(
			"focus-visible:-outline-offset-2",
		);
	});

	test("reads a different profile's formats", () => {
		const item = subscriptionItem("netflix");
		render(
			<SubscriptionTable
				list={{
					items: [item],
					totals: { monthlyMinor: 64900, yearlyMinor: 778800, count: 1 },
				}}
				formats={{
					...FORMATS,
					currency: "USD",
					numberLocale: "en-US",
					dateLocale: "en-US",
				}}
				sorting={DEFAULT_SORTING}
				onSortingChange={() => {}}
				selected={null}
				onSelect={() => {}}
			/>,
		);
		expect(screen.getAllByText("$649.00").length).toBeGreaterThan(0);
		expect(screen.getByText("Nov 5")).toBeVisible();
	});
});
