import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { TransactionFilter } from "@/lib/transactions/url";
import { DATE_COMMIT_MS } from "../CustomRange";
import { type DateBounds, DateMenu, type DateMenuProps } from "../DateMenu";
import type { FilterLocale } from "../../lib/filter-labels";

// The golden clock (TST-3); only `Date`, so user-event's timers stay real.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-02T06:30:00Z"));
});
afterEach(() => vi.useRealTimers());

const IN: FilterLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

/** Check B's date counts (F03 section 5): food applied. */
const COUNTS = {
	all: 7,
	this_month: 1,
	last_month: 4,
	last_3_months: 7,
	year_to_date: 7,
	last_12_months: 7,
};

function renderMenu(props: Partial<DateMenuProps> = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [filter, setFilter] = useState<TransactionFilter>(props.filter ?? {});
		return (
			<DateMenu
				locale={IN}
				firstDayOfWeek="monday"
				count={4}
				{...props}
				filter={filter}
				onChange={(dates: DateBounds) => {
					onChange(dates);
					setFilter(dates ?? {});
				}}
			/>
		);
	}
	render(
		<I18nProvider locale="en-IN">
			<Harness />
		</I18nProvider>,
	);
	return { user, onChange };
}

const trigger = (name: string | RegExp = /^Date/) =>
	screen.getByRole("button", { name, hidden: true });
const open = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(trigger());
	return screen.findByRole("dialog", { name: "Date" });
};
const radio = (name: string) =>
	screen.getByRole("radio", { name: new RegExp(`^${name}( \\d+)?$`) });
const closed = () =>
	waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
const day = (date: string) =>
	screen.getByRole("button", { name: new RegExp(`(^|, )\\w+, ${date}\\b`) });
const part = (field: "From" | "To", type: "day" | "month" | "year") =>
	screen.getByRole("spinbutton", { name: `${type}, ${field}` });

describe("the trigger (BR-F03-39)", () => {
	test("reads Date All time without dates, not marked active", () => {
		renderMenu();

		expect(trigger("Date All time")).not.toHaveClass("border-accent");
	});

	test("check B reads Date Last month, marked active", () => {
		renderMenu({ filter: { from: "2026-10-01", to: "2026-10-31" } });

		expect(trigger("Date Last month")).toHaveClass("border-accent");
	});

	test("a custom range reads its days", () => {
		renderMenu({ filter: { from: "2026-10-05", to: "2026-10-20" } });

		expect(trigger("Date 5 Oct to 20 Oct")).toBeInTheDocument();
	});
});

describe("the presets", () => {
	test("lists every preset, then Custom range, in section 3's order", async () => {
		const { user } = renderMenu();

		const dialog = await open(user);

		expect(
			within(dialog)
				.getAllByRole("radio")
				.map((each) => each.closest("label")!.textContent),
		).toEqual([
			"All time",
			"This month",
			"Last month",
			"Last 3 months",
			"Year to date",
			"Last 12 months",
			"Custom range",
		]);
	});

	// AC-F03-40
	test("shows check B's counts beside each preset, none beside Custom range", async () => {
		const { user } = renderMenu({ counts: COUNTS });

		await open(user);

		expect(radio("All time").closest("label")).toHaveTextContent("All time 7");
		expect(radio("This month").closest("label")).toHaveTextContent(
			"This month 1",
		);
		expect(radio("Last month").closest("label")).toHaveTextContent(
			"Last month 4",
		);
		expect(radio("Custom range").closest("label")).toHaveTextContent(
			/^Custom range$/,
		);
	});

	test("holds each count's place while the counts load", async () => {
		const { user } = renderMenu({ countsPending: true });

		const dialog = await open(user);

		expect(dialog.querySelectorAll("label .bg-track")).toHaveLength(6);
	});

	test("shows the counts, not placeholders, once they arrive", async () => {
		const { user } = renderMenu({ countsPending: true, counts: COUNTS });

		const dialog = await open(user);

		expect(dialog.querySelectorAll("label .bg-track")).toHaveLength(0);
	});

	test("checks the preset the dates match", async () => {
		const { user } = renderMenu({
			filter: { from: "2026-01-01", to: "2026-11-02" },
		});

		await open(user);

		expect(radio("Year to date")).toBeChecked();
	});

	test.each([
		["This month", { from: "2026-11-01", to: "2026-11-30" }],
		["Last month", { from: "2026-10-01", to: "2026-10-31" }],
		["Last 3 months", { from: "2026-09-01", to: "2026-11-30" }],
		["Year to date", { from: "2026-01-01", to: "2026-11-02" }],
		["Last 12 months", { from: "2025-12-01", to: "2026-11-30" }],
	])("%s commits its dates from today (D-227) and closes", async (name, dates) => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(radio(name));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(dates);
		await closed();
	});

	test("All time drops the dates and closes", async () => {
		const { user, onChange } = renderMenu({
			filter: { from: "2026-10-01", to: "2026-10-31" },
		});

		await open(user);
		await user.click(radio("All time"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
		await closed();
		expect(trigger("Date All time")).toBeInTheDocument();
	});

	test("tells the caller when it opens, for the counts", async () => {
		const onOpenChange = vi.fn();
		const { user } = renderMenu({ onOpenChange });

		await open(user);

		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
	});
});

describe("Custom range (BR-F03-39, D-538)", () => {
	test("keeps the popover open, widens it and shows From, To and the calendar", async () => {
		const { user, onChange } = renderMenu();

		const dialog = await open(user);
		expect(dialog.closest(".w-60")).not.toBeNull();
		await user.click(radio("Custom range"));

		expect(onChange).not.toHaveBeenCalled();
		expect(radio("Custom range")).toBeChecked();
		expect(screen.getByRole("group", { name: "From" })).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "To" })).toBeInTheDocument();
		expect(screen.getByRole("application")).toHaveAccessibleName(
			/^Custom range/,
		);
		expect(dialog.closest(".w-130")).not.toBeNull();
		// D-547: no Done; a range applies as soon as it is chosen.
		expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
	});

	test("without a range the fields are empty and no days line shows", async () => {
		const { user } = renderMenu();

		await open(user);
		await user.click(radio("Custom range"));

		expect(part("From", "day")).toHaveAttribute("data-placeholder", "true");
		expect(screen.queryByText(/days?\b/)).toBeNull();
	});

	test("starts the fields from the preset's dates", async () => {
		const { user } = renderMenu({
			filter: { from: "2026-10-01", to: "2026-10-31" },
		});

		await open(user);
		await user.click(radio("Custom range"));

		expect(part("From", "day")).toHaveAttribute("aria-valuenow", "1");
		expect(part("To", "day")).toHaveAttribute("aria-valuenow", "31");
	});

	test("a committed custom range opens there, with its days and count", async () => {
		const { user } = renderMenu({
			filter: { from: "2026-10-05", to: "2026-10-20" },
		});

		await open(user);

		expect(radio("Custom range")).toBeChecked();
		expect(screen.getByText("16 days · 4 Transactions")).toBeInTheDocument();
	});

	test("the line reads one day and one Transaction in the singular", async () => {
		const { user } = renderMenu({
			filter: { from: "2026-10-05", to: "2026-10-05" },
			count: 1,
		});

		await open(user);

		expect(screen.getByText("1 day · 1 Transaction")).toBeInTheDocument();
	});

	test("the line leaves out the count until the header has one", async () => {
		const { user } = renderMenu({
			filter: { from: "2026-10-05", to: "2026-10-20" },
			count: undefined,
		});

		await open(user);

		expect(screen.getByText(/^16 days$/)).toBeInTheDocument();
	});

	// AC-F03-65
	test("choosing 20 Oct then 5 Oct on the calendar commits 5 Oct to 20 Oct at once", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(radio("Custom range"));
		await user.click(day("20 October 2026"));
		expect(onChange).not.toHaveBeenCalled();
		await user.click(day("5 October 2026"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			from: "2026-10-05",
			to: "2026-10-20",
		});
		expect(trigger("Date 5 Oct to 20 Oct")).toBeInTheDocument();
		expect(part("From", "day")).toHaveAttribute("aria-valuenow", "5");
		expect(screen.getByRole("dialog", { name: "Date" })).toBeInTheDocument();
	});

	test("the calendar's future days are disabled", async () => {
		const { user } = renderMenu();

		await open(user);
		await user.click(radio("Custom range"));

		expect(day("3 November 2026")).toHaveAttribute("aria-disabled", "true");
	});

	test("the calendar starts on the profile's week start", async () => {
		const { user } = renderMenu({ firstDayOfWeek: "sunday" });

		await open(user);
		await user.click(radio("Custom range"));

		expect(
			screen.getAllByRole("grid")[0]!.querySelector("th"),
		).toHaveTextContent("Sun");
	});

	test("typing both dates commits once the range is complete", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(radio("Custom range"));
		await user.click(part("From", "day"));
		await user.keyboard("05102026");
		expect(onChange).not.toHaveBeenCalled();
		await user.click(part("To", "day"));
		await user.keyboard("20102026");

		await waitFor(() => expect(onChange).toHaveBeenCalled());
		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			from: "2026-10-05",
			to: "2026-10-20",
		});
	});

	test("changing one typed day commits the new range", async () => {
		const { user, onChange } = renderMenu({
			filter: { from: "2026-10-05", to: "2026-10-20" },
		});

		await open(user);
		await user.click(part("To", "day"));
		await user.keyboard("{ArrowUp}");

		await waitFor(() => expect(onChange).toHaveBeenCalled());
		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			from: "2026-10-05",
			to: "2026-10-21",
		});
	});

	// D-543
	// AC-F03-68
	test("From after To says so, under From, and commits nothing", async () => {
		const { user, onChange } = renderMenu({
			filter: { from: "2026-10-05", to: "2026-10-20" },
		});

		await open(user);
		await user.click(part("From", "day"));
		await user.keyboard("25");
		await new Promise((resolve) => setTimeout(resolve, DATE_COMMIT_MS + 50));

		expect(onChange).not.toHaveBeenCalled();
		expect(
			screen.getByText("Choose a From date on or before To."),
		).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "From" })).toHaveAttribute(
			"data-invalid",
			"true",
		);
	});

	test("putting From back on or before To clears the message and commits", async () => {
		const { user, onChange } = renderMenu({
			filter: { from: "2026-10-05", to: "2026-10-20" },
		});

		await open(user);
		await user.click(part("From", "day"));
		await user.keyboard("25");
		await user.click(part("From", "day"));
		await user.keyboard("10");

		await waitFor(() => expect(onChange).toHaveBeenCalled());
		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			from: "2026-10-10",
			to: "2026-10-20",
		});
		expect(screen.queryByText("Choose a From date on or before To.")).toBeNull();
	});

	// AC-F03-68
	test("a day typed digit by digit is one change, after typing stops", async () => {
		const { user, onChange } = renderMenu({
			filter: { from: "2026-10-05", to: "2026-10-28" },
		});

		await open(user);
		await user.click(part("From", "day"));
		await user.keyboard("12");
		expect(onChange).not.toHaveBeenCalled();

		await waitFor(() => expect(onChange).toHaveBeenCalled());
		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			from: "2026-10-12",
			to: "2026-10-28",
		});
	});

	test("a range chosen on the calendar drops a typed change still waiting", async () => {
		const { user, onChange } = renderMenu({
			filter: { from: "2026-10-05", to: "2026-10-28" },
		});

		await open(user);
		await user.click(part("From", "day"));
		await user.keyboard("12");
		await user.click(day("14 October 2026"));
		await user.click(day("16 October 2026"));
		const calls = onChange.mock.calls.length;
		await new Promise((resolve) => setTimeout(resolve, DATE_COMMIT_MS + 50));

		// Nothing typed lands after the calendar's range, however slow the machine.
		expect(onChange).toHaveBeenCalledTimes(calls);
		expect(onChange).toHaveBeenLastCalledWith({
			from: "2026-10-14",
			to: "2026-10-16",
		});
	});

	test("a press outside closes it, keeping the range already applied", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(radio("Custom range"));
		await user.click(day("5 October 2026"));
		await user.click(day("6 October 2026"));
		await user.click(document.body);

		await closed();
		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			from: "2026-10-05",
			to: "2026-10-06",
		});
		expect(trigger("Date 5 Oct to 6 Oct")).toBeInTheDocument();
	});

	test("closing without a range goes back to the presets next time", async () => {
		const { user } = renderMenu();

		await open(user);
		await user.click(radio("Custom range"));
		await user.keyboard("{Escape}");
		await closed();
		await open(user);

		expect(radio("All time")).toBeChecked();
		expect(screen.queryByRole("group", { name: "From" })).toBeNull();
	});

	test("a preset chosen after Custom range commits and closes", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(radio("Custom range"));
		await user.click(radio("This month"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			from: "2026-11-01",
			to: "2026-11-30",
		});
		await closed();
	});
});

describe("className", () => {
	test("goes on the trigger, after its own classes", () => {
		renderMenu({ className: "ms-auto" });

		expect(trigger()).toHaveClass("inline-flex", "ms-auto");
	});
});
