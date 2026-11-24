import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { phoneWeeks } from "../../lib/calendar";
import { CalendarDays, type CalendarDaysProps } from "../CalendarDays";
import { CAL, entry, goldenNovember } from "./calendar-data";

const scrolled = vi.fn();
const original = Element.prototype.scrollIntoView;
afterEach(() => {
	scrolled.mockClear();
	Element.prototype.scrollIntoView = original;
});

function setup(
	props: Partial<CalendarDaysProps> & {
		items?: ReturnType<typeof goldenNovember>;
		today?: string;
	} = {},
) {
	const { items = goldenNovember(), today = CAL.today, ...rest } = props;
	Element.prototype.scrollIntoView = scrolled;
	const onSelectItem = vi.fn();
	render(
		<CalendarDays
			weeks={phoneWeeks("2026-11", "monday", items, { ...CAL, today })}
			onSelectItem={onSelectItem}
			{...rest}
		/>,
	);
	return { onSelectItem, user: userEvent.setup() };
}

const week = (name: string) => screen.getByRole("region", { name });

describe("CalendarDays on golden, below 768 px (BR-F05-38)", () => {
	// AC-F05-38
	test("the weeks are 1 Nov, 2 to 8 Nov, 9 to 15, 16 to 22, 23 to 29 and 30 Nov", () => {
		setup();
		expect(
			screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
		).toEqual([
			"1 Nov",
			"2 to 8 Nov",
			"9 to 15 Nov",
			"16 to 22 Nov",
			"23 to 29 Nov",
			"30 Nov",
		]);
	});

	test("each week is a region named by its days", () => {
		setup();
		expect(week("2 to 8 Nov")).toBeVisible();
	});

	test("a week shows its total, and one of nothing offers to show its days", () => {
		setup();
		// The total, and the item's own amount.
		expect(within(week("1 Nov")).getAllByText("₹18,000.00")).toHaveLength(2);
		expect(within(week("2 to 8 Nov")).getAllByText("₹649.00")).toHaveLength(2);
		expect(within(week("9 to 15 Nov")).getAllByText("₹1,500.00")).toHaveLength(
			2,
		);
		for (const name of ["16 to 22 Nov", "23 to 29 Nov", "30 Nov"]) {
			expect(
				within(week(name)).getByRole("button", {
					name: "Nothing due · Show days",
				}),
			).toBeVisible();
		}
	});

	// AC-F05-38
	test("2 to 8 Nov: Today, Tue 3, Wed 4, Netflix with in 3 days, and Fri 6 to Sun 8", () => {
		setup();
		const region = week("2 to 8 Nov");
		expect(within(region).getByText("Today")).toBeVisible();
		expect(within(region).getByText("Tue 3")).toBeVisible();
		expect(within(region).getByText("Wed 4")).toBeVisible();
		expect(within(region).getByText("in 3 days")).toBeVisible();
		expect(within(region).getByText("Fri 6 to Sun 8")).toBeVisible();
	});

	test("a due item reads its name, its relative date and its amount", () => {
		setup();
		const button = within(week("2 to 8 Nov")).getByRole("button");
		expect(button).toHaveTextContent("Thu 5");
		expect(button).toHaveTextContent("Netflix");
		expect(button).toHaveTextContent("in 3 days");
		expect(button).toHaveTextContent("₹649.00");
	});

	test("a charge reads Charged", () => {
		setup();
		expect(within(week("1 Nov")).getByRole("button")).toHaveTextContent(
			"Charged",
		);
	});

	test("pressing an item selects it", async () => {
		const { onSelectItem, user } = setup();
		await user.click(within(week("2 to 8 Nov")).getByRole("button"));
		expect(onSelectItem.mock.calls[0]![0]).toMatchObject({
			name: "Netflix",
			date: "2026-11-05",
		});
	});

	test("an empty week keeps today's line only, until its days are shown", async () => {
		const { user } = setup({ today: "2026-11-18" });
		const region = week("16 to 22 Nov");
		expect(within(region).getByText("Today")).toBeVisible();
		expect(within(region).queryByText("Mon 16")).toBeNull();
		await user.click(
			within(region).getByRole("button", { name: "Nothing due · Show days" }),
		);
		expect(within(region).getByText("Mon 16")).toBeVisible();
		expect(within(region).getByText("Tue 17")).toBeVisible();
		expect(within(region).getByText("Thu 19 to Sun 22")).toBeVisible();
	});

	test("Show days opens that week only and takes the hint away", async () => {
		const { user } = setup();
		await user.click(
			within(week("23 to 29 Nov")).getByRole("button", {
				name: "Nothing due · Show days",
			}),
		);
		expect(
			within(week("23 to 29 Nov")).queryByRole("button", {
				name: "Nothing due · Show days",
			}),
		).toBeNull();
		expect(
			within(week("23 to 29 Nov")).getByText("Mon 23 to Sun 29"),
		).toBeVisible();
		expect(
			within(week("30 Nov")).getByRole("button", {
				name: "Nothing due · Show days",
			}),
		).toBeVisible();
	});

	test("opened weeks stay open when another is opened", async () => {
		const { user } = setup();
		for (const name of ["23 to 29 Nov", "30 Nov"]) {
			await user.click(
				within(week(name)).getByRole("button", {
					name: "Nothing due · Show days",
				}),
			);
		}
		expect(
			within(week("23 to 29 Nov")).getByText("Mon 23 to Sun 29"),
		).toBeVisible();
		expect(within(week("30 Nov")).getByText("Mon 30")).toBeVisible();
	});

	test("two presses before a redraw open both weeks", () => {
		setup();
		const show = (name: string) =>
			within(week(name)).getByRole("button", {
				name: "Nothing due · Show days",
			});
		const first = show("23 to 29 Nov");
		const second = show("30 Nov");
		act(() => {
			fireEvent.click(first);
			fireEvent.click(second);
		});
		expect(
			within(week("23 to 29 Nov")).getByText("Mon 23 to Sun 29"),
		).toBeVisible();
		expect(within(week("30 Nov")).getByText("Mon 30")).toBeVisible();
	});

	test("three empty days in a row are one line, fewer are a line each", () => {
		setup();
		const region = week("2 to 8 Nov");
		expect(within(region).getByText("Tue 3")).toBeVisible();
		expect(within(region).getByText("Wed 4")).toBeVisible();
		expect(within(region).getByText("Fri 6 to Sun 8")).toBeVisible();
	});

	test("a week with only skipped and paused items shows them and no total or hint", () => {
		setup({ items: [entry("skipped", "2026-11-19", "Netflix", 64900)] });
		const region = week("16 to 22 Nov");
		const button = within(region).getByRole("button");
		expect(button).toHaveTextContent("Skipped");
		// The heading line holds the days and nothing else: no total.
		expect(region.querySelector("h3")!.parentElement).toHaveTextContent(
			/^16 to 22 Nov$/,
		);
		expect(
			within(region).queryByRole("button", {
				name: "Nothing due · Show days",
			}),
		).toBeNull();
	});

	test("a struck item is struck through and muted", () => {
		setup({ items: [entry("paused", "2026-11-19", "Netflix", 64900)] });
		const button = within(week("16 to 22 Nov")).getByRole("button");
		expect(
			within(button).getByText("Netflix").closest(".line-through"),
		).not.toBeNull();
		expect(within(button).getByText("₹649.00")).toHaveClass("text-ink-3");
	});

	test("a second item on a day hides its repeated date but keeps the room", () => {
		setup({
			items: [
				entry("due", "2026-11-05", "Netflix", 64900),
				entry("due", "2026-11-05", "Cult Gym", 150000),
			],
		});
		const [first, second] = within(week("2 to 8 Nov")).getAllByRole("button");
		expect(first).toHaveTextContent("Thu 5");
		expect(second?.firstElementChild).toHaveClass("invisible");
	});

	test("is not busy when loaded", () => {
		setup();
		expect(week("1 Nov").parentElement).toHaveAttribute("aria-busy", "false");
	});
});

describe("CalendarDays scrolling to today (BR-F05-38)", () => {
	test("the current month scrolls today's line into view", () => {
		setup();
		expect(scrolled).toHaveBeenCalledOnce();
		expect(scrolled).toHaveBeenCalledWith({ block: "start" });
	});

	test("it scrolls the line that is today's, in a week with an item", () => {
		setup();
		const target = scrolled.mock.contexts[0] as HTMLElement;
		expect(target).toHaveTextContent("Today");
	});

	test("another month does not scroll", () => {
		setup({ today: "2026-12-15" });
		expect(scrolled).not.toHaveBeenCalled();
	});

	test("a browser without scrollIntoView does not fail", () => {
		// @ts-expect-error jsdom has none; the component guards.
		delete Element.prototype.scrollIntoView;
		expect(() =>
			render(
				<CalendarDays
					weeks={phoneWeeks("2026-11", "monday", goldenNovember(), CAL)}
					onSelectItem={vi.fn()}
				/>,
			),
		).not.toThrow();
		expect(screen.getByText("Today")).toBeVisible();
	});

	test("it does not scroll while loading", () => {
		setup({ isLoading: true });
		expect(scrolled).not.toHaveBeenCalled();
	});
});

describe("CalendarDays while loading (BR-F05-38)", () => {
	test("keeps each week's heading and holds its lines with bars", () => {
		setup({ isLoading: true });
		expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByText(/₹/)).toBeNull();
		expect(document.querySelectorAll(".bg-track").length).toBeGreaterThanOrEqual(
			6,
		);
	});

	test("is marked busy", () => {
		setup({ isLoading: true });
		expect(week("1 Nov").parentElement).toHaveAttribute("aria-busy", "true");
	});
});
