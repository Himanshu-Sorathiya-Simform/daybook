import { parseDate } from "@internationalized/date";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar as AriaCalendar, I18nProvider } from "react-aria-components";
import { describe, expect, test } from "vitest";

import {
	CalendarHeader,
	type CalendarHeaderProps,
} from "@/components/forms/CalendarHeader";

function renderHeader(
	props: CalendarHeaderProps = {},
	limits: { min?: string; max?: string } = {},
) {
	render(
		<I18nProvider locale="en-IN">
			<AriaCalendar
				aria-label="Date"
				defaultFocusedValue={parseDate("2026-11-02")}
				{...(limits.min ? { minValue: parseDate(limits.min) } : {})}
				{...(limits.max ? { maxValue: parseDate(limits.max) } : {})}
			>
				<CalendarHeader {...props} />
			</AriaCalendar>
		</I18nProvider>,
	);
	return userEvent.setup();
}

const previous = () => screen.getByRole("button", { name: "Previous month" });
const next = () => screen.getByRole("button", { name: "Next month" });

describe("CalendarHeader", () => {
	test("has the previous arrow, the month and the next arrow, in that order", () => {
		renderHeader();

		const header = document.querySelector("header")!;
		expect(header.children[0]).toBe(previous());
		expect(header.children[1]).toHaveTextContent("November 2026");
		expect(header.children[2]).toBe(next());
	});

	test("the arrows move the calendar a month at a time", async () => {
		const user = renderHeader();

		await user.click(previous());
		expect(document.querySelector("header h2")).toHaveTextContent(
			"October 2026",
		);
		await user.click(next());
		await user.click(next());

		expect(document.querySelector("header h2")).toHaveTextContent(
			"December 2026",
		);
	});

	test("an arrow past the last or first day that can be chosen is disabled and dimmed", () => {
		renderHeader({}, { min: "2026-11-01", max: "2026-11-30" });

		expect(previous()).toBeDisabled();
		expect(next()).toBeDisabled();
		expect(next()).toHaveClass(
			"disabled:opacity-40",
			"disabled:cursor-not-allowed",
		);
	});

	test("with room on both sides both arrows are enabled", () => {
		renderHeader();

		expect(previous()).toBeEnabled();
		expect(next()).toBeEnabled();
	});

	test("its arrows hide their icons from screen readers and grow to 44px on phones", () => {
		renderHeader();

		expect(previous().querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
		expect(previous()).toHaveClass("size-8", "max-md:size-11");
	});

	test("without the heading it keeps the arrows apart and shows no month", () => {
		renderHeader({ showHeading: false });

		expect(document.querySelector("header h2")).not.toBeInTheDocument();
		expect(document.querySelector("header")!.children).toHaveLength(3);
		expect(previous()).toBeInTheDocument();
		expect(next()).toBeInTheDocument();
	});

	test("puts the caller's classes on the header, after its own", () => {
		renderHeader({ className: "mb-1" });

		expect(document.querySelector("header")).toHaveClass("flex", "mb-1");
	});
});
