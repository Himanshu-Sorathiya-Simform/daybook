import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MonthGrid, type MonthGridProps } from "@/components/navigation/MonthGrid";

/** Golden: the current month is November 2026, so the range is Nov 2023 to Nov 2027. */
const RANGE = { first: "2023-11", last: "2027-11" };

function renderGrid(props: Partial<MonthGridProps> = {}) {
	const onChange = vi.fn();
	const view = render(
		<MonthGrid
			value="2026-10"
			onChange={onChange}
			range={RANGE}
			current="2026-11"
			dateLocale="en-IN"
			{...props}
		/>,
	);
	return { ...view, onChange };
}

const grid = () => screen.getByRole("listbox", { name: "Months" });
const month = (name: string | RegExp) => screen.getByRole("option", { name });
const names = () =>
	within(grid())
		.getAllByRole("option")
		.map((option) => option.getAttribute("aria-label"));

/** jsdom lays nothing out, so the grid's arrow keys, which move by position, get each month at
 * its place in four columns of 80 by 50 px. */
beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function (this: HTMLElement) {
			const key = this.getAttribute("data-key");
			const index =
				key && /^\d{4}-\d{2}$/.test(key) ? Number(key.slice(5)) - 1 : -1;
			const left = index < 0 ? 0 : (index % 4) * 80;
			const top = index < 0 ? 0 : Math.floor(index / 4) * 50;
			const [width, height] = index < 0 ? [320, 150] : [80, 50];
			return {
				x: left,
				y: top,
				left,
				top,
				width,
				height,
				right: left + width,
				bottom: top + height,
				toJSON: () => ({}),
			} as DOMRect;
		},
	);
});
afterEach(() => vi.restoreAllMocks());

describe("structure", () => {
	test("the value's year, between Previous year and Next year", () => {
		renderGrid();
		expect(screen.getByText("2026")).toBeVisible();
		expect(screen.getByRole("button", { name: "Previous year" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Next year" })).toBeVisible();
	});

	test("one list box named Months, described by the year it shows", () => {
		renderGrid();
		expect(grid()).toHaveAccessibleDescription("2026");
	});

	test("twelve months in order, in four columns, each shown by its short name", () => {
		renderGrid();
		const options = within(grid()).getAllByRole("option");
		expect(options.map((option) => option.textContent)).toEqual([
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sept",
			"Oct",
			"Nov",
			"Dec",
		]);
		expect(grid()).toHaveClass("grid", "grid-cols-4");
	});

	test("each month is named in full, the current month as this month", () => {
		renderGrid();
		expect(names().slice(8)).toEqual([
			"September 2026",
			"October 2026",
			"November 2026, this month",
			"December 2026",
		]);
	});

	test("takes another name", () => {
		renderGrid({ label: "Apply from" });
		expect(screen.getByRole("listbox", { name: "Apply from" })).toBeVisible();
	});

	test("follows the profile's date locale", () => {
		renderGrid({ dateLocale: "ja-JP" });
		expect(screen.getByText("2026年")).toBeVisible();
		expect(month("2026年10月")).toHaveTextContent("10月");
	});

	test("takes the caller's classes on its root", () => {
		const { container } = renderGrid({ className: "max-w-85" });
		expect(container.firstElementChild).toHaveClass("max-w-85", "flex");
	});
});

describe("figures (BR-F04-14)", () => {
	// F04 section 5: the 2026 year summary.
	const FIGURES = {
		"2026-09": "81.0%",
		"2026-10": "119.7%",
		"2026-11": "3.8%",
		"2026-12": "0.0%",
	};

	test("a month with a figure shows it under its name, and says it", () => {
		renderGrid({ figures: FIGURES });
		expect(month("October 2026, 119.7%")).toHaveTextContent("Oct119.7%");
		expect(month("November 2026, this month, 3.8%")).toBeVisible();
	});

	test("a month without a figure shows none", () => {
		renderGrid({ figures: FIGURES });
		expect(month("August 2026")).toHaveTextContent(/^Aug$/);
	});

	test("months are taller when they hold figures", () => {
		const { unmount } = renderGrid({ figures: FIGURES });
		expect(month("August 2026")).toHaveClass("min-h-13");
		unmount();
		renderGrid();
		expect(month("August 2026")).toHaveClass("min-h-10");
		expect(month("August 2026")).toHaveClass("max-md:min-h-11");
	});
});

describe("figures on their way (BR-F04-14)", () => {
	const FIGURES = { "2026-10": "119.7%" };
	const slots = () => grid().querySelectorAll("[role=option] > span:nth-child(2)");
	const bars = () => grid().querySelectorAll('[role=option] [aria-hidden="true"]');

	test("while they load, every month holds a skeleton bar in its figure's place", () => {
		renderGrid({ figures: {}, isLoadingFigures: true });
		expect(slots()).toHaveLength(12);
		expect(bars()).toHaveLength(12);
	});

	test("the skeleton is hidden from screen readers and changes no month's name", () => {
		renderGrid({ figures: {}, isLoadingFigures: true });
		expect(names()).toEqual([
			"January 2026",
			"February 2026",
			"March 2026",
			"April 2026",
			"May 2026",
			"June 2026",
			"July 2026",
			"August 2026",
			"September 2026",
			"October 2026",
			"November 2026, this month",
			"December 2026",
		]);
		expect(month("October 2026")).toHaveTextContent(/^Oct$/);
	});

	test("a month that has its figure shows it, not a bar", () => {
		renderGrid({ figures: FIGURES, isLoadingFigures: true });
		expect(month("October 2026, 119.7%")).toHaveTextContent("Oct119.7%");
		expect(
			month("October 2026, 119.7%").querySelector('[aria-hidden="true"]'),
		).toBeNull();
		expect(bars()).toHaveLength(11);
	});

	test("once loaded, a month with no figure keeps its line, so the names stay put", () => {
		renderGrid({ figures: FIGURES });
		expect(slots()).toHaveLength(12);
		expect(bars()).toHaveLength(0);
		expect(month("August 2026")).toHaveTextContent(/^Aug$/);
	});

	test("the line is one line of the figure's text tall, and the same with or without a figure", () => {
		renderGrid({ figures: FIGURES });
		const [withFigure, without] = [
			month("October 2026, 119.7%").children[1],
			month("August 2026").children[1],
		];
		expect(withFigure).toHaveClass("h-lh", "text-small");
		expect(without).toHaveClass("h-lh", "text-small");
	});

	test("with no figures prop there is no line and no bar, loading or not", () => {
		renderGrid({ isLoadingFigures: true });
		expect(slots()).toHaveLength(0);
		expect(bars()).toHaveLength(0);
		expect(month("August 2026")).toHaveClass("min-h-10");
	});

	test("months out of the range hold a bar too", () => {
		renderGrid({ figures: {}, isLoadingFigures: true, value: "2023-12" });
		// 2023 starts at November: only the grid's twelve months of the year shown.
		expect(bars()).toHaveLength(12);
	});
});

describe("the chosen month and the current month", () => {
	test("the value is selected, and no other month", () => {
		renderGrid();
		expect(month("October 2026")).toHaveAttribute("aria-selected", "true");
		const selected = within(grid())
			.getAllByRole("option")
			.filter((option) => option.getAttribute("aria-selected") === "true");
		expect(selected).toHaveLength(1);
	});

	test("the chosen month takes the accent outline; the current month is bold", () => {
		renderGrid();
		expect(month("October 2026")).toHaveClass("selected:border-accent");
		expect(month("November 2026, this month")).toHaveClass("font-bold");
		expect(month("October 2026")).toHaveClass("font-medium");
	});

	test("a value in another year selects nothing in the year shown", async () => {
		const user = userEvent.setup();
		renderGrid({ value: "2026-10" });
		await user.click(screen.getByRole("button", { name: "Previous year" }));
		expect(
			within(grid())
				.getAllByRole("option")
				.some((option) => option.getAttribute("aria-selected") === "true"),
		).toBe(false);
	});
});

describe("choosing", () => {
	test("a press on a month chooses it", async () => {
		const user = userEvent.setup();
		const { onChange } = renderGrid();
		await user.click(month("March 2026"));
		expect(onChange).toHaveBeenCalledWith("2026-03");
	});

	test("a press on the chosen month chooses it again, so a popover can close", async () => {
		const user = userEvent.setup();
		const { onChange } = renderGrid();
		await user.click(month("October 2026"));
		expect(onChange).toHaveBeenCalledWith("2026-10");
		expect(month("October 2026")).toHaveAttribute("aria-selected", "true");
	});

	test("the grid shows what its caller chose, not what was pressed", async () => {
		const user = userEvent.setup();
		renderGrid();
		await user.click(month("March 2026"));
		expect(month("March 2026")).toHaveAttribute("aria-selected", "false");
		expect(month("October 2026")).toHaveAttribute("aria-selected", "true");
	});

	test("Enter and Space choose the focused month", async () => {
		const user = userEvent.setup();
		const { onChange } = renderGrid({ autoFocus: true });
		await user.keyboard("{ArrowRight}");
		await user.keyboard("{Enter}");
		expect(onChange).toHaveBeenLastCalledWith("2026-11");
		await user.keyboard("{ArrowRight}");
		await user.keyboard(" ");
		expect(onChange).toHaveBeenLastCalledWith("2026-12");
	});

	test("Escape on a month chooses nothing, and leaves Escape to what holds the grid", async () => {
		const user = userEvent.setup();
		const onKeyDown = vi.fn();
		const onChange = vi.fn();
		render(
			<div onKeyDown={(event) => onKeyDown(event.key)}>
				<MonthGrid
					value="2026-10"
					onChange={onChange}
					range={RANGE}
					current="2026-11"
					dateLocale="en-IN"
					autoFocus
				/>
			</div>,
		);
		await user.keyboard("{Escape}");
		expect(onChange).not.toHaveBeenCalled();
		expect(onKeyDown).toHaveBeenCalledWith("Escape");
		expect(month("October 2026")).toHaveAttribute("aria-selected", "true");
	});

	test("moving with the arrows chooses nothing by itself", async () => {
		const user = userEvent.setup();
		const { onChange } = renderGrid({ autoFocus: true });
		await user.keyboard("{ArrowLeft}{ArrowDown}{ArrowUp}");
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("keyboard", () => {
	test("with autoFocus, focus starts on the chosen month", () => {
		renderGrid({ autoFocus: true });
		expect(month("October 2026")).toHaveFocus();
	});

	test("without autoFocus, nothing takes focus", () => {
		renderGrid();
		expect(document.body).toHaveFocus();
	});

	test("Tab goes Previous year, Next year, then into the grid on the chosen month, and out", async () => {
		const user = userEvent.setup();
		render(
			<>
				<MonthGrid
					value="2026-10"
					onChange={vi.fn()}
					range={RANGE}
					current="2026-11"
					dateLocale="en-IN"
				/>
				<button type="button">After</button>
			</>,
		);
		await user.tab();
		expect(screen.getByRole("button", { name: "Previous year" })).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: "Next year" })).toHaveFocus();
		await user.tab();
		expect(month("October 2026")).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
	});

	test("Left and Right move one month, Up and Down one row of four", async () => {
		const user = userEvent.setup();
		renderGrid({ autoFocus: true });
		await user.keyboard("{ArrowRight}");
		expect(month("November 2026, this month")).toHaveFocus();
		await user.keyboard("{ArrowUp}");
		expect(month("July 2026")).toHaveFocus();
		await user.keyboard("{ArrowLeft}");
		expect(month("June 2026")).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(month("October 2026")).toHaveFocus();
	});

	test("Home and End go to the first and last months", async () => {
		const user = userEvent.setup();
		renderGrid({ autoFocus: true });
		await user.keyboard("{End}");
		expect(month("December 2026")).toHaveFocus();
		await user.keyboard("{Home}");
		expect(month("January 2026")).toHaveFocus();
	});
});

describe("the range (BR-F04-07)", () => {
	test("months before the range are disabled, and a press on one chooses nothing", async () => {
		const user = userEvent.setup();
		const { onChange } = renderGrid({ value: "2023-11" });
		expect(month("October 2023")).toHaveAttribute("aria-disabled", "true");
		expect(month("November 2023")).not.toHaveAttribute("aria-disabled");
		await user.click(month("October 2023"));
		expect(onChange).not.toHaveBeenCalled();
	});

	test("months after the range are disabled", () => {
		renderGrid({ value: "2027-11" });
		expect(month("November 2027")).not.toHaveAttribute("aria-disabled");
		expect(month("December 2027")).toHaveAttribute("aria-disabled", "true");
	});

	test("a disabled month shows as faded and refuses the pointer", () => {
		renderGrid({ value: "2023-11" });
		expect(month("January 2023")).toHaveClass(
			"disabled:opacity-45",
			"disabled:cursor-not-allowed",
		);
	});

	test("Home skips the disabled months", async () => {
		const user = userEvent.setup();
		renderGrid({ value: "2023-12", autoFocus: true });
		await user.keyboard("{Home}");
		expect(month("November 2023")).toHaveFocus();
	});

	test("Previous year stops at the range's first year", async () => {
		const user = userEvent.setup();
		renderGrid({ value: "2024-05" });
		const previous = screen.getByRole("button", { name: "Previous year" });
		await user.click(previous);
		expect(screen.getByText("2023")).toBeVisible();
		expect(previous).toHaveAttribute("aria-disabled", "true");
		await user.click(previous);
		expect(screen.getByText("2023")).toBeVisible();
	});

	test("Next year stops at the range's last year", async () => {
		const user = userEvent.setup();
		renderGrid({ value: "2026-05" });
		const next = screen.getByRole("button", { name: "Next year" });
		await user.click(next);
		expect(screen.getByText("2027")).toBeVisible();
		expect(next).toHaveAttribute("aria-disabled", "true");
		await user.click(next);
		expect(screen.getByText("2027")).toBeVisible();
	});
});

describe("moving between years", () => {
	test("the months follow the year shown, and choosing one gives its own year", async () => {
		const user = userEvent.setup();
		const { onChange } = renderGrid();
		await user.click(screen.getByRole("button", { name: "Previous year" }));
		expect(screen.getByText("2025")).toBeVisible();
		await user.click(month("March 2025"));
		expect(onChange).toHaveBeenCalledWith("2025-03");
	});

	test("coming back to the value's year shows it chosen again", async () => {
		const user = userEvent.setup();
		renderGrid();
		await user.click(screen.getByRole("button", { name: "Next year" }));
		await user.click(screen.getByRole("button", { name: "Previous year" }));
		expect(month("October 2026")).toHaveAttribute("aria-selected", "true");
	});

	test("reports each year the arrows move to, and none when an arrow is disabled", async () => {
		const user = userEvent.setup();
		const onYearChange = vi.fn();
		renderGrid({ value: "2024-05", onYearChange });
		await user.click(screen.getByRole("button", { name: "Previous year" }));
		await user.click(screen.getByRole("button", { name: "Previous year" }));
		await user.click(screen.getByRole("button", { name: "Next year" }));
		expect(onYearChange.mock.calls).toEqual([[2023], [2024]]);
	});

	test("the current month is named only in its own year", async () => {
		const user = userEvent.setup();
		renderGrid();
		await user.click(screen.getByRole("button", { name: "Next year" }));
		expect(month("November 2027")).toBeVisible();
		expect(month("November 2027")).toHaveClass("font-medium");
	});
});
