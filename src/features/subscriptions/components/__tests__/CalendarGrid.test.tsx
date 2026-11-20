import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { gridWeeks, weekdayHeaders } from "../../lib/calendar";
import { CalendarGrid, type CalendarGridProps } from "../CalendarGrid";
import { BUSY_DAY, CAL, entry, goldenNovember } from "./calendar-data";

function setup(
	props: Partial<CalendarGridProps> & { items?: typeof BUSY_DAY } = {},
) {
	const { items = goldenNovember(), ...rest } = props;
	const onSelectItem = vi.fn();
	render(
		<CalendarGrid
			title="November 2026"
			weeks={gridWeeks("2026-11", "monday", items, CAL)}
			weekdays={weekdayHeaders("monday", CAL)}
			formats={CAL}
			selected={null}
			markedDue={null}
			onSelectItem={onSelectItem}
			{...rest}
		/>,
	);
	return { onSelectItem, user: userEvent.setup() };
}

const rows = () => within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");

describe("CalendarGrid on golden, from a Monday week start (BR-F05-38)", () => {
	test("is a table captioned with the month", () => {
		setup();
		expect(screen.getByRole("table", { name: "November 2026" })).toBeVisible();
	});

	test("heads the seven weekdays from Monday, then Week", () => {
		setup();
		expect(
			screen.getAllByRole("columnheader").map((head) => head.textContent),
		).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Week"]);
	});

	test("a Sunday week start heads Sun first", () => {
		setup({ weekdays: weekdayHeaders("sunday", CAL) });
		expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Sun");
	});

	// AC-F05-38
	test("has six weeks, from 26 Oct to 6 Dec", () => {
		setup();
		expect(rows()).toHaveLength(6);
		const first = within(rows()[0]!).getAllByRole("cell")[0]!;
		expect(first).toHaveTextContent("26");
		const last = within(rows()[5]!).getAllByRole("cell")[6]!;
		expect(last).toHaveTextContent("6");
	});

	// AC-F05-38
	test("the week totals are 18,000.00 for the week of 1 Nov, 649.00, 1,500.00, then dashes", () => {
		setup();
		const totals = rows().map(
			(row) => within(row).getAllByRole("cell").at(-1)!.textContent,
		);
		expect(totals).toEqual([
			"₹18,000.00",
			"₹649.00",
			"₹1,500.00",
			"—",
			"—",
			"—",
		]);
	});

	test("a week with nothing has its total muted", () => {
		setup();
		const cell = within(rows()[3]!).getAllByRole("cell").at(-1)!;
		expect(cell).toHaveClass("text-ink-3");
		expect(within(rows()[0]!).getAllByRole("cell").at(-1)).toHaveClass(
			"text-ink-2",
		);
	});

	// AC-F05-38
	test("26 to 31 Oct and 1 to 6 Dec are dimmed and hold no item, and 1 Dec reads 1 Dec", () => {
		setup();
		const cells = within(rows()[0]!).getAllByRole("cell");
		for (const cell of cells.slice(0, 6)) {
			expect(cell).toHaveClass("opacity-45");
			expect(within(cell).queryByRole("button")).toBeNull();
		}
		const lastWeek = within(rows()[5]!).getAllByRole("cell");
		expect(lastWeek[1]).toHaveTextContent("1 Dec");
		expect(lastWeek[1]).toHaveClass("opacity-45");
		expect(cells[6]).not.toHaveClass("opacity-45");
	});

	test("today, 2 Nov, is in a filled circle and read as today", () => {
		setup();
		const today = screen.getByText("Today,", { exact: false });
		expect(today.closest(".bg-ink")).not.toBeNull();
		expect(today.closest("td")).toHaveTextContent("Today, 2");
	});

	test("only today has the circle", () => {
		setup();
		expect(document.querySelectorAll(".bg-ink.rounded-full")).toHaveLength(1);
	});

	// AC-F05-38
	test("shows Sunrise's charge on 1 Nov and Netflix's and Cult Gym's due items", () => {
		setup();
		expect(
			screen.getByRole("button", {
				name: "Sunrise Apartments, ₹18,000.00, charged",
			}),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Netflix, ₹649.00, due" }),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Cult Gym, ₹1,500.00, due" }),
		).toBeVisible();
		expect(screen.getAllByRole("button")).toHaveLength(3);
	});

	test("each item sits in the cell of its date", () => {
		setup();
		expect(
			screen.getByRole("button", { name: /^Netflix/ }).closest("td"),
		).toHaveTextContent("5");
		expect(
			screen.getByRole("button", { name: /^Cult Gym/ }).closest("td"),
		).toHaveTextContent("10");
	});

	test("pressing an item selects it", async () => {
		const { onSelectItem, user } = setup();
		await user.click(screen.getByRole("button", { name: /^Netflix/ }));
		expect(onSelectItem).toHaveBeenCalledOnce();
		expect(onSelectItem.mock.calls[0]![0]).toMatchObject({
			name: "Netflix",
			date: "2026-11-05",
		});
	});

	// AC-F05-38
	test("a day with two items shows both", () => {
		setup({
			items: [
				entry("due", "2026-11-05", "Netflix", 64900),
				entry("due", "2026-11-05", "Cult Gym", 150000),
			],
		});
		expect(screen.getAllByRole("button")).toHaveLength(2);
		expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
	});

	// AC-F05-38
	test("a day with three items shows the first and +2 more with the day's total", () => {
		setup({ items: BUSY_DAY });
		expect(
			screen.getByRole("button", {
				name: "Sunrise Apartments, ₹18,000.00, due",
			}),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "+2 more · ₹20,149" }),
		).toBeVisible();
		expect(screen.queryByRole("button", { name: /^Netflix/ })).toBeNull();
	});

	test("no cell clips its items, so a focused item's outline shows whole", () => {
		setup({ items: BUSY_DAY });
		for (const cell of screen.getAllByRole("cell")) {
			expect(cell).not.toHaveClass("overflow-hidden");
		}
	});

	test("a day's popover button is cut with an ellipsis, not clipped by its cell", () => {
		setup({ items: BUSY_DAY });
		expect(screen.getByRole("button", { name: /more/ })).toHaveClass("truncate");
	});

	test("the busy day has the soft fill and the others do not", () => {
		setup({ items: BUSY_DAY });
		const busy = screen.getByRole("button", { name: /more/ }).parentElement!;
		expect(busy).toHaveClass("bg-soft");
		expect(
			screen.getByText("Today,", { exact: false }).closest("td")!
				.firstElementChild,
		).not.toHaveClass("bg-soft");
	});

	test("the popover's items select too", async () => {
		const { onSelectItem, user } = setup({ items: BUSY_DAY });
		await user.click(screen.getByRole("button", { name: /more/ }));
		await user.click(await screen.findByRole("button", { name: /^Netflix/ }));
		expect(onSelectItem.mock.calls[0]![0]).toMatchObject({ name: "Netflix" });
	});

	test("the marked item is tinted, an item of the same Subscription on another date is not", () => {
		setup({
			items: [
				entry("due", "2026-11-05", "Netflix", 64900),
				entry("due", "2026-11-12", "Netflix", 64900),
			],
			selected: "id-Netflix",
			markedDue: "2026-11-05",
		});
		const [first, second] = screen.getAllByRole("button");
		expect(first).toHaveClass("bg-accent-soft");
		expect(second).not.toHaveClass("bg-accent-soft");
	});

	test("with no date marked nothing is tinted, even for the selected Subscription", () => {
		setup({ selected: "id-Netflix", markedDue: null });
		for (const button of screen.getAllByRole("button")) {
			expect(button).not.toHaveClass("bg-accent-soft");
		}
	});

	test("a charge of a deleted Subscription is never tinted", () => {
		setup({
			items: [
				entry("charged", "2026-11-05", "Old", 100, { subscriptionId: null }),
			],
			selected: null,
			markedDue: "2026-11-05",
		});
		expect(screen.getByRole("button")).not.toHaveClass("bg-accent-soft");
	});

	test("an item on a day outside the month is never drawn", () => {
		setup({ items: [entry("due", "2026-12-01", "Netflix", 64900)] });
		expect(screen.queryByRole("button")).toBeNull();
	});
});

describe("CalendarGrid while loading (BR-F05-38)", () => {
	test("keeps its weeks and holds the month's days and totals with bars", () => {
		setup({ isLoading: true });
		expect(rows()).toHaveLength(6);
		expect(screen.queryByRole("button")).toBeNull();
		expect(document.querySelectorAll(".bg-track")).toHaveLength(
			// Two lines for each of the 30 days of the month, and 6 week totals.
			30 * 2 + 6,
		);
	});

	test("is marked busy", () => {
		setup({ isLoading: true });
		expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
	});

	test("a loaded grid is not busy", () => {
		setup();
		expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "false");
	});

	test("no total text shows while loading", () => {
		setup({ isLoading: true });
		expect(screen.queryByText(/₹/)).toBeNull();
	});
});
