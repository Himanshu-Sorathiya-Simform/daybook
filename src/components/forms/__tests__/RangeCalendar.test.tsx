import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	type DateRange,
	RangeCalendar,
	type RangeCalendarProps,
} from "@/components/forms/RangeCalendar";

// The golden clock (TST-3); only `Date`, so user-event's timers stay real.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-02T06:30:00Z"));
});
afterEach(() => vi.useRealTimers());

type Options = Partial<RangeCalendarProps> & { locale?: string };

/** Date → Custom on the golden clock: future days disabled (BR-F03-39). */
function renderRange({ locale = "en-IN", ...props }: Options = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [value, setValue] = useState<DateRange | null>(props.value ?? null);
		return (
			<RangeCalendar
				label="Custom range"
				today="2026-11-02"
				maxValue="2026-11-02"
				{...props}
				value={value}
				onChange={(next) => {
					onChange(next);
					setValue(next);
				}}
			/>
		);
	}
	const view = render(
		<I18nProvider locale={locale}>
			<Harness />
		</I18nProvider>,
	);
	return { ...view, user, onChange };
}

/** A day by its date, "2 November 2026", whatever React Aria puts before or after it. */
const day = (date: string) =>
	screen.getByRole("button", { name: new RegExp(`(^|, )\\w+, ${date}\\b`) });

const grids = () => screen.getAllByRole("grid");
const captions = () =>
	Array.from(document.querySelectorAll("p")).map((caption) => caption.textContent);

describe("the months", () => {
	// AC-F03-65
	test("shows two months, the later one holding today before a range is chosen", () => {
		renderRange();

		expect(grids()).toHaveLength(2);
		expect(captions()).toEqual(["October 2026", "November 2026"]);
	});

	test("names each month's grid, and hides the captions that repeat it", () => {
		renderRange();

		expect(grids()[0]).toHaveAccessibleName(/October 2026/);
		expect(grids()[1]).toHaveAccessibleName(/November 2026/);
		for (const caption of document.querySelectorAll("p")) {
			expect(caption).toHaveAttribute("aria-hidden", "true");
		}
	});

	test("names both months for screen readers, and shows no heading between the arrows", () => {
		renderRange();

		expect(screen.getByRole("application")).toHaveAccessibleName(
			"Custom range, October to November 2026",
		);
		expect(document.querySelector("header h2")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Previous month" }),
		).toBeInTheDocument();
	});

	test("with a range, the later month holds the range's end", () => {
		renderRange({ value: { start: "2026-08-25", end: "2026-09-10" } });

		expect(captions()).toEqual(["August 2026", "September 2026"]);
	});

	test("is named by the label for screen readers", () => {
		renderRange();

		expect(screen.getByRole("application")).toHaveAccessibleName(
			/^Custom range/,
		);
	});

	test("disables the future days", () => {
		renderRange();

		expect(day("3 November 2026")).toHaveAttribute("aria-disabled", "true");
		expect(day("2 November 2026")).not.toHaveAttribute("aria-disabled");
		expect(day("3 November 2026")).toHaveClass("disabled:opacity-40");
	});

	test("without a maximum the future days can be chosen", () => {
		render(
			<I18nProvider locale="en-IN">
				<RangeCalendar
					label="Custom range"
					value={null}
					today="2026-11-02"
					onChange={() => {}}
				/>
			</I18nProvider>,
		);

		expect(day("3 November 2026")).not.toHaveAttribute("aria-disabled");
		expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
	});

	test("disables the days before a minimum", () => {
		renderRange({ minValue: "2026-10-10" });

		expect(day("9 October 2026")).toHaveAttribute("aria-disabled", "true");
		expect(day("10 October 2026")).not.toHaveAttribute("aria-disabled");
	});

	test("outlines today only", () => {
		renderRange();

		expect(day("2 November 2026")).toHaveClass("ring-accent");
		expect(day("1 November 2026")).not.toHaveClass("ring-accent");
	});

	test("uses the smaller days of a two-month popover", () => {
		renderRange();

		expect(day("1 November 2026")).toHaveClass("h-7.5");
		expect(day("1 November 2026")).not.toHaveClass("h-9");
	});

	test("lays the months side by side, stacking them when there is no room", () => {
		renderRange();

		expect(grids()[0]!.closest(".grid")).toHaveClass(
			"grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))]",
		);
	});

	test.each([
		["monday", "Mon"],
		["sunday", "Sun"],
		["saturday", "Sat"],
	] as const)(
		"with the week starting on %s, both months start with %s",
		(firstDayOfWeek, first) => {
			renderRange({ firstDayOfWeek });

			for (const grid of grids()) {
				expect(grid.querySelector("th")).toHaveTextContent(first);
			}
		},
	);

	test("with one month shows only the month holding the range's end", () => {
		renderRange({ months: 1 });

		expect(grids()).toHaveLength(1);
		expect(captions()).toEqual(["November 2026"]);
	});

	test("with one month the arrows still move a month at a time", async () => {
		const { user } = renderRange({ months: 1 });

		await user.click(screen.getByRole("button", { name: "Previous month" }));

		expect(captions()).toEqual(["October 2026"]);
	});

	test("names the months in the locale", () => {
		renderRange({ locale: "de-DE" });

		expect(captions()).toEqual(["Oktober 2026", "November 2026"]);
	});

	test("puts the caller's classes on the root, after its own", () => {
		renderRange({ className: "mt-2" });

		expect(screen.getByRole("application")).toHaveClass("flex", "mt-2");
	});
});

describe("moving between months", () => {
	// AC-F03-65
	test("next is disabled when the later month holds the last day it can choose", () => {
		renderRange();

		expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled();
	});

	// AC-F03-65
	test("previous moves both months back by one", async () => {
		const { user } = renderRange();

		await user.click(screen.getByRole("button", { name: "Previous month" }));

		expect(captions()).toEqual(["September 2026", "October 2026"]);
		expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
	});

	test("next moves both months on again", async () => {
		const { user } = renderRange();

		await user.click(screen.getByRole("button", { name: "Previous month" }));
		await user.click(screen.getByRole("button", { name: "Previous month" }));
		await user.click(screen.getByRole("button", { name: "Next month" }));

		expect(captions()).toEqual(["September 2026", "October 2026"]);
	});

	test("Page Up moves the focused day a month back", async () => {
		const { user } = renderRange();

		day("2 November 2026").focus();
		await user.keyboard("{PageUp}");

		expect(day("2 October 2026")).toHaveFocus();
	});
});

describe("choosing a range", () => {
	test("a first press starts the range and reports nothing yet", async () => {
		const { user, onChange } = renderRange();

		await user.click(day("5 October 2026"));

		expect(onChange).not.toHaveBeenCalled();
		expect(day("5 October 2026")).toHaveAttribute("data-selected", "true");
	});

	test("a second press ends it and reports both days", async () => {
		const { user, onChange } = renderRange();

		await user.click(day("5 October 2026"));
		await user.click(day("20 October 2026"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			start: "2026-10-05",
			end: "2026-10-20",
		});
	});

	// AC-F03-65
	test("ends pressed in reverse order report the earlier day first", async () => {
		const { user, onChange } = renderRange();

		await user.click(day("20 October 2026"));
		await user.click(day("5 October 2026"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			start: "2026-10-05",
			end: "2026-10-20",
		});
	});

	test("a range may span the two months", async () => {
		const { user, onChange } = renderRange();

		await user.click(day("28 October 2026"));
		await user.click(day("2 November 2026"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			start: "2026-10-28",
			end: "2026-11-02",
		});
	});

	test("the same day twice is a one-day range", async () => {
		const { user, onChange } = renderRange();

		await user.click(day("5 October 2026"));
		await user.click(day("5 October 2026"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			start: "2026-10-05",
			end: "2026-10-05",
		});
	});

	test("a future day cannot start or end a range", async () => {
		const { user, onChange } = renderRange();

		await user.click(day("3 November 2026"));
		await user.click(day("1 November 2026"));
		await user.click(day("4 November 2026"));

		expect(onChange).not.toHaveBeenCalled();
		expect(day("1 November 2026")).toHaveAttribute("data-selected", "true");
	});

	test("Enter starts a range, moving on a day, and Enter again ends it", async () => {
		const { user, onChange } = renderRange();

		day("2 November 2026").focus();
		await user.keyboard("{ArrowUp}{Enter}");
		expect(day("27 October 2026")).toHaveFocus();
		await user.keyboard("{ArrowRight}{Enter}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			start: "2026-10-26",
			end: "2026-10-28",
		});
	});

	test("Escape drops a range that was started and not ended", async () => {
		const { user, onChange } = renderRange();

		day("2 November 2026").focus();
		await user.keyboard("{ArrowUp}{Enter}{Escape}{Enter}");

		expect(onChange).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(day("26 October 2026")).not.toHaveAttribute("data-selected"),
		);
	});

	test("marks the chosen range: both ends filled, the days between tinted", () => {
		renderRange({ value: { start: "2026-10-05", end: "2026-10-08" } });

		const start = day("5 October 2026");
		const between = day("6 October 2026");
		const end = day("8 October 2026");
		expect(start).toHaveAttribute("data-selection-start", "true");
		expect(end).toHaveAttribute("data-selection-end", "true");
		expect(between).toHaveAttribute("data-selected", "true");
		expect(between).not.toHaveAttribute("data-selection-start");
		expect(between).not.toHaveAttribute("data-selection-end");
		expect(day("9 October 2026")).not.toHaveAttribute("data-selected");
		expect(between).toHaveClass(
			"selected:bg-accent-soft",
			"selection-start:bg-accent",
			"selection-end:bg-accent",
		);
		expect(between).not.toHaveClass("selected:bg-accent");
	});

	test("reads the chosen days as selected inside their grid", () => {
		renderRange({ value: { start: "2026-10-05", end: "2026-10-06" } });

		const october = grids()[1]!;
		const chosen = within(october)
			.getAllByRole("gridcell")
			.filter((cell) => cell.getAttribute("aria-selected") === "true")
			.map((cell) => cell.textContent);
		expect(chosen).toEqual(["5", "6"]);
	});
});

describe("following its props", () => {
	const fixed = {
		label: "Custom range",
		today: "2026-11-02",
		maxValue: "2026-11-02",
		onChange: () => {},
	};

	test("a range set from outside brings its end into view", () => {
		const { rerender } = render(
			<I18nProvider locale="en-IN">
				<RangeCalendar
					{...fixed}
					value={null}
				/>
			</I18nProvider>,
		);
		rerender(
			<I18nProvider locale="en-IN">
				<RangeCalendar
					{...fixed}
					value={{ start: "2026-06-01", end: "2026-07-15" }}
				/>
			</I18nProvider>,
		);

		expect(captions()).toEqual(["June 2026", "July 2026"]);
		expect(day("15 July 2026")).toHaveAttribute("data-selection-end", "true");
	});

	test("clearing the range keeps the months in view", () => {
		const { rerender } = render(
			<I18nProvider locale="en-IN">
				<RangeCalendar
					{...fixed}
					value={{ start: "2026-06-01", end: "2026-07-15" }}
				/>
			</I18nProvider>,
		);
		rerender(
			<I18nProvider locale="en-IN">
				<RangeCalendar
					{...fixed}
					value={null}
				/>
			</I18nProvider>,
		);

		expect(captions()).toEqual(["June 2026", "July 2026"]);
		expect(day("15 July 2026")).not.toHaveAttribute("data-selected");
	});

	test("the same end from outside leaves the months where the user moved them", async () => {
		const user = userEvent.setup();
		const value = { start: "2026-10-05", end: "2026-10-20" };
		const { rerender } = render(
			<I18nProvider locale="en-IN">
				<RangeCalendar
					{...fixed}
					value={value}
				/>
			</I18nProvider>,
		);
		await user.click(screen.getByRole("button", { name: "Previous month" }));
		rerender(
			<I18nProvider locale="en-IN">
				<RangeCalendar
					{...fixed}
					value={{ start: "2026-10-01", end: "2026-10-20" }}
				/>
			</I18nProvider>,
		);

		expect(captions()).toEqual(["August 2026", "September 2026"]);
	});
});
