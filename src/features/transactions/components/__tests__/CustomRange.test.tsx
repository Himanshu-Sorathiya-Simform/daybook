import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "react-aria-components";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { DateRange } from "@/components/forms/RangeCalendar";
import { CustomRange, type CustomRangeProps } from "../CustomRange";

// The golden clock (TST-3); only `Date`, so user-event's timers stay real.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-02T06:30:00Z"));
});
afterEach(() => vi.useRealTimers());

const base: CustomRangeProps = {
	value: null,
	onChange: () => {},
	today: "2026-11-02",
	firstDayOfWeek: "monday",
	count: 4,
};

function renderRange(props: Partial<CustomRangeProps> = {}) {
	const onChange = vi.fn();
	const ui = (value: DateRange | null) => (
		<I18nProvider locale="en-IN">
			<CustomRange
				{...base}
				{...props}
				value={value}
				onChange={onChange}
			/>
		</I18nProvider>
	);
	const view = render(ui(props.value ?? null));
	return {
		onChange,
		user: userEvent.setup(),
		setValue: (value: DateRange | null) => view.rerender(ui(value)),
	};
}

const part = (field: "From" | "To", type: "day" | "month" | "year") =>
	screen.getByRole("spinbutton", { name: `${type}, ${field}` });
const day = (date: string) =>
	screen.getByRole("button", { name: new RegExp(`(^|, )\\w+, ${date}\\b`) });

describe("CustomRange (BR-F03-39, D-538, D-543)", () => {
	test("a range set from elsewhere fills both fields", () => {
		const { setValue } = renderRange();

		setValue({ start: "2026-10-05", end: "2026-10-20" });

		expect(part("From", "day")).toHaveAttribute("aria-valuenow", "5");
		expect(part("To", "day")).toHaveAttribute("aria-valuenow", "20");
	});

	test("a range cleared from elsewhere empties both fields and the line", () => {
		const { setValue } = renderRange({
			value: { start: "2026-10-05", end: "2026-10-20" },
		});
		expect(screen.getByText("16 days · 4 Transactions")).toBeInTheDocument();

		setValue(null);

		expect(part("From", "day")).toHaveAttribute("data-placeholder", "true");
		expect(part("To", "day")).toHaveAttribute("data-placeholder", "true");
		expect(screen.queryByText(/days/)).toBeNull();
	});

	test("with no range yet, the calendar's range commits", async () => {
		const { user, onChange } = renderRange();

		await user.click(day("5 October 2026"));
		await user.click(day("6 October 2026"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			start: "2026-10-05",
			end: "2026-10-06",
		});
	});

	test("one typed date alone commits nothing", async () => {
		const { user, onChange } = renderRange();

		await user.click(part("From", "day"));
		await user.keyboard("05102026");
		await new Promise((resolve) => setTimeout(resolve, 350));

		expect(onChange).not.toHaveBeenCalled();
	});

	test("the calendar's range equal to the committed one commits nothing", async () => {
		const { user, onChange } = renderRange({
			value: { start: "2026-10-05", end: "2026-10-06" },
		});

		await user.click(day("5 October 2026"));
		await user.click(day("6 October 2026"));

		expect(onChange).not.toHaveBeenCalled();
	});

	test("a typed change put back before the wait ends commits nothing", async () => {
		const { user, onChange } = renderRange({
			value: { start: "2026-10-05", end: "2026-10-20" },
		});

		await user.click(part("To", "day"));
		await user.keyboard("{ArrowUp}{ArrowDown}");
		await new Promise((resolve) => setTimeout(resolve, 350));

		expect(onChange).not.toHaveBeenCalled();
	});

	test("a range with the same start and a new end commits", async () => {
		const { user, onChange } = renderRange({
			value: { start: "2026-10-05", end: "2026-10-06" },
		});

		await user.click(part("To", "day"));
		await user.keyboard("{ArrowUp}");

		await waitFor(() => expect(onChange).toHaveBeenCalled());
		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			start: "2026-10-05",
			end: "2026-10-07",
		});
	});

	test("puts the caller's classes on its root", () => {
		const { container } = render(
			<I18nProvider locale="en-IN">
				<CustomRange
					{...base}
					className="pt-2"
				/>
			</I18nProvider>,
		);

		expect(container.firstElementChild).toHaveClass("flex", "pt-2");
	});
});
