import { parseDate } from "@internationalized/date";
import { render, screen } from "@testing-library/react";
import {
	Calendar as AriaCalendar,
	I18nProvider,
	RangeCalendar as AriaRangeCalendar,
} from "react-aria-components";
import { afterEach, describe, expect, test } from "vitest";

import {
	CalendarMonth,
	type CalendarMonthProps,
} from "@/components/forms/CalendarMonth";

const ZONE = process.env["TZ"];
afterEach(() => {
	if (ZONE === undefined) delete process.env["TZ"];
	else process.env["TZ"] = ZONE;
});

function inCalendar(props: Partial<CalendarMonthProps> = {}, locale = "en-IN") {
	return render(
		<I18nProvider locale={locale}>
			<AriaCalendar
				aria-label="Date"
				defaultFocusedValue={parseDate("2026-10-15")}
				visibleDuration={{ months: 2 }}
			>
				<CalendarMonth
					today="2026-11-02"
					{...props}
				/>
			</AriaCalendar>
		</I18nProvider>,
	);
}

const caption = () => document.querySelector("p");
const day = (date: string) =>
	screen.getByRole("button", { name: new RegExp(`(^|, )\\w+, ${date}\\b`) });

describe("CalendarMonth", () => {
	test("shows the first visible month by default", () => {
		inCalendar({ showMonthName: true });

		expect(caption()).toHaveTextContent("October 2026");
		expect(screen.getByRole("grid")).toHaveAccessibleName(/October 2026/);
	});

	test("an offset shows a later visible month", () => {
		inCalendar({ showMonthName: true, offset: { months: 1 } });

		expect(caption()).toHaveTextContent("November 2026");
		expect(day("2 November 2026")).toBeInTheDocument();
	});

	test("shows no month name unless asked", () => {
		inCalendar();

		expect(caption()).toBeNull();
	});

	test("names the month in the locale", () => {
		inCalendar({ showMonthName: true }, "de-DE");

		expect(caption()).toHaveTextContent("Oktober 2026");
	});

	test("names the right month on a device behind UTC", () => {
		process.env["TZ"] = "America/Los_Angeles";
		// A locale no other test uses, so its formatter is made after the zone changes.
		inCalendar({ showMonthName: true }, "en-AU");

		expect(caption()).toHaveTextContent("October 2026");
	});

	test("names the right month on a device ahead of UTC", () => {
		process.env["TZ"] = "Pacific/Kiritimati";
		// A locale no other test uses, so its formatter is made after the zone changes.
		inCalendar({ showMonthName: true, offset: { months: 1 } }, "en-NZ");

		expect(caption()).toHaveTextContent("November 2026");
	});

	test("weekday names are short, and hidden from the grid's reading", () => {
		inCalendar();

		const head = document.querySelector("thead")!;
		expect(head).toHaveAttribute("aria-hidden", "true");
		expect(head.querySelector("th")).toHaveTextContent(/^Sun$/);
	});

	test("full-size days by default, smaller when compact", () => {
		const { unmount } = inCalendar();
		expect(day("15 October 2026")).toHaveClass("h-9");
		unmount();

		inCalendar({ compact: true });
		expect(day("15 October 2026")).toHaveClass("h-7.5");
		expect(day("15 October 2026")).not.toHaveClass("h-9");
	});

	test("in a single calendar the chosen day is filled", () => {
		render(
			<I18nProvider locale="en-IN">
				<AriaCalendar
					aria-label="Date"
					value={parseDate("2026-10-15")}
				>
					<CalendarMonth today="2026-11-02" />
				</AriaCalendar>
			</I18nProvider>,
		);

		expect(day("15 October 2026")).toHaveClass("selected:bg-accent");
		expect(day("15 October 2026")).not.toHaveClass("selected:bg-accent-soft");
	});

	test("in a range calendar the days between the ends are tinted", () => {
		render(
			<I18nProvider locale="en-IN">
				<AriaRangeCalendar
					aria-label="Range"
					value={{
						start: parseDate("2026-10-14"),
						end: parseDate("2026-10-16"),
					}}
				>
					<CalendarMonth today="2026-11-02" />
				</AriaRangeCalendar>
			</I18nProvider>,
		);

		expect(day("15 October 2026")).toHaveClass(
			"selected:bg-accent-soft",
			"selection-start:bg-accent",
			"selection-end:bg-accent",
		);
	});

	test("puts the caller's classes on the root, after its own", () => {
		inCalendar({ className: "w-60" });

		expect(screen.getByRole("grid").parentElement).toHaveClass("flex", "w-60");
	});
});
