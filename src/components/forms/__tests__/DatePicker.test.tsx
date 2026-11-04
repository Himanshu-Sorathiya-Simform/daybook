import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DatePicker, type DatePickerProps } from "@/components/forms/DatePicker";

// The golden clock (TST-3). React Aria reads the device clock for its own "Today" label, so
// only `Date` is frozen; timers stay real for user-event.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-02T06:30:00Z"));
});
afterEach(() => vi.useRealTimers());

const NOTE =
	"You can choose today or one of the 10 days before. Arrow keys move, Enter picks.";

const LABELS: Record<string, string> = {
	"2026-11-02": "Today, 2 Nov",
	"2026-11-01": "Yesterday, 1 Nov",
	"2026-10-30": "Fri, 30 Oct",
	"2026-10-23": "Fri, 23 Oct",
};

type Options = Partial<DatePickerProps> & { locale?: string };

/** The entry dialog's date on the golden clock: today and the 10 days before (BR-F03-08). */
function renderPicker({ locale = "en-IN", ...props }: Options = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [value, setValue] = useState(props.value ?? "2026-11-02");
		return (
			<DatePicker
				label="Date"
				display={LABELS[value] ?? value}
				today="2026-11-02"
				minValue="2026-10-23"
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
			<button type="button">Before</button>
			<Harness />
		</I18nProvider>,
	);
	return { ...view, user, onChange };
}

// While the popover is open React Aria hides the page behind it, the button included.
const button = (name: string | RegExp = /^Date/) =>
	screen.getByRole("button", { name, hidden: true });

async function open(user: ReturnType<typeof userEvent.setup>) {
	await user.click(button());
	return screen.findByRole("dialog", { name: "Choose a date" });
}

/** A day of the open calendar by its date, "2 November 2026". React Aria names a day
 * "Monday, 2 November 2026", with "Today, " before it and " selected" after it as they apply. */
const day = (date: string) =>
	screen.getByRole("button", { name: new RegExp(`(^|, )\\w+, ${date}\\b`) });

const closed = () =>
	waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("the button", () => {
	test("is named by the label and the day it shows", () => {
		renderPicker();

		expect(button("Date Today, 2 Nov")).toBeInTheDocument();
	});

	test("shows the day the caller formats, and the label above it", () => {
		renderPicker({ value: "2026-10-30" });

		expect(button()).toHaveTextContent("Fri, 30 Oct");
		expect(screen.getByText("Date")).toHaveClass("font-semibold");
	});

	test("says it opens a dialog and is collapsed until pressed", () => {
		renderPicker();

		expect(button()).toHaveAttribute("aria-expanded", "false");
	});

	test("is described by the hint, which shows under it", () => {
		renderPicker({ hint: "Today or one of the 10 days before." });

		expect(button()).toHaveAccessibleDescription(
			"Today or one of the 10 days before.",
		);
		expect(screen.getByText("Today or one of the 10 days before.")).toHaveClass(
			"text-ink-3",
		);
	});

	test("has no description without a hint or an error", () => {
		renderPicker();

		expect(button()).not.toHaveAttribute("aria-describedby");
	});

	test("an error replaces the hint, is read out with it and outlines it in red", () => {
		renderPicker({
			hint: "Today or one of the 10 days before.",
			error: "Choose a date from 6 Oct to 16 Oct.",
		});

		expect(button()).toHaveAccessibleDescription(
			"Choose a date from 6 Oct to 16 Oct.",
		);
		expect(
			screen.queryByText("Today or one of the 10 days before."),
		).not.toBeInTheDocument();
		expect(screen.getByText("Choose a date from 6 Oct to 16 Oct.")).toHaveClass(
			"text-neg",
		);
		expect(button()).toHaveClass("border-neg");
		expect(button()).not.toHaveClass("border-edge");
	});

	test("without an error keeps the usual outline", () => {
		renderPicker();

		expect(button()).toHaveClass("border-edge");
		expect(button()).not.toHaveClass("border-neg");
	});

	test("disabled, it cannot be pressed or focused and opens nothing", async () => {
		const { user } = renderPicker({ isDisabled: true });

		expect(button()).toBeDisabled();
		await user.click(button());
		await user.tab();
		await user.tab();

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(button()).not.toHaveFocus();
	});

	test("puts the caller's classes on the root, after its own", () => {
		const { container } = renderPicker({ className: "col-span-2" });

		expect(container.querySelector("div")).toHaveClass(
			"flex",
			"flex-col",
			"col-span-2",
		);
	});
});

describe("opening", () => {
	test("a press opens the popover named Choose a date", async () => {
		const { user } = renderPicker();

		const dialog = await open(user);

		expect(dialog).toBeInTheDocument();
		expect(button()).toHaveAttribute("aria-expanded", "true");
	});

	test("Enter on the focused button opens it", async () => {
		const { user } = renderPicker();

		await user.tab();
		await user.tab();
		expect(button()).toHaveFocus();
		await user.keyboard("{Enter}");

		expect(
			await screen.findByRole("dialog", { name: "Choose a date" }),
		).toBeInTheDocument();
	});

	test("Space on the focused button opens it", async () => {
		const { user } = renderPicker();

		button().focus();
		await user.keyboard(" ");

		expect(
			await screen.findByRole("dialog", { name: "Choose a date" }),
		).toBeInTheDocument();
	});

	test("focus starts on the chosen day", async () => {
		const { user } = renderPicker({ value: "2026-10-30" });

		await open(user);

		await waitFor(() => expect(day("30 October 2026")).toHaveFocus());
	});

	test("shows the chosen day's month, named in the locale", async () => {
		const { user } = renderPicker({ value: "2026-10-30" });

		const dialog = await open(user);

		expect(within(dialog).getByText("October 2026")).toBeInTheDocument();
		expect(
			within(dialog).getByRole("grid", { name: "Date, October 2026" }),
		).toBeInTheDocument();
	});

	test("the note shows under the calendar and is read out with the dialog", async () => {
		const { user } = renderPicker({ note: NOTE });

		const dialog = await open(user);

		expect(dialog).toHaveAccessibleDescription(NOTE);
		expect(within(dialog).getByText(NOTE)).toHaveClass("text-ink-3");
	});

	test("without a note the dialog has no description", async () => {
		const { user } = renderPicker();

		const dialog = await open(user);

		expect(dialog).not.toHaveAttribute("aria-describedby");
	});
});

describe("the month", () => {
	test("marks the chosen day as selected and filled", async () => {
		const { user } = renderPicker({ value: "2026-10-30" });

		await open(user);

		const chosen = day("30 October 2026");
		expect(chosen.closest("td")).toHaveAttribute("aria-selected", "true");
		expect(chosen).toHaveAttribute("data-selected", "true");
		expect(chosen).toHaveClass("selected:bg-accent", "selected:text-on-accent");
	});

	// AC-F03-65
	test("outlines today, and no other day", async () => {
		const { user } = renderPicker({ value: "2026-10-30" });

		await open(user);
		await user.click(screen.getByRole("button", { name: "Next month" }));

		expect(day("2 November 2026")).toHaveClass("ring-accent", "ring-[1.5px]");
		expect(day("1 November 2026")).not.toHaveClass("ring-accent");
	});

	test("when today is chosen, its fill replaces the outline", async () => {
		const { user } = renderPicker();

		await open(user);

		expect(day("2 November 2026")).toHaveAttribute("data-selected", "true");
		expect(day("2 November 2026")).toHaveClass("selected:ring-0");
	});

	test("outlines the profile's today, which the caller gives, not the device's", async () => {
		// The device says 2 Nov; the profile's zone is still on 1 Nov.
		const { user } = renderPicker({ value: "2026-10-30", today: "2026-11-01" });

		await user.click(button());
		await screen.findByRole("dialog");
		await user.click(
			screen.getByRole("button", { name: "Next month", hidden: true }),
		);

		expect(day("1 November 2026")).toHaveClass("ring-accent");
		expect(day("2 November 2026")).not.toHaveClass("ring-accent");
	});

	test("enables only today and the 10 days before (AC-F03-61)", async () => {
		const { user } = renderPicker({ value: "2026-10-30" });

		const dialog = await open(user);
		const october = within(dialog)
			.getAllByRole("button", { name: /October 2026/ })
			.filter((cell) => !cell.hasAttribute("aria-disabled"))
			.map((cell) => cell.textContent);
		await user.click(within(dialog).getByRole("button", { name: "Next month" }));
		const november = within(dialog)
			.getAllByRole("button", { name: /November 2026/ })
			.filter((cell) => !cell.hasAttribute("aria-disabled"))
			.map((cell) => cell.textContent);

		expect([...october, ...november]).toEqual([
			"23",
			"24",
			"25",
			"26",
			"27",
			"28",
			"29",
			"30",
			"31",
			"1",
			"2",
		]);
	});

	test("dims a day it cannot choose", async () => {
		const { user } = renderPicker();

		await open(user);

		const future = day("3 November 2026");
		expect(future).toHaveAttribute("aria-disabled", "true");
		expect(future).toHaveClass(
			"disabled:opacity-40",
			"disabled:cursor-not-allowed",
		);
	});

	test("a press on a day it cannot choose changes nothing and keeps it open", async () => {
		const { user, onChange } = renderPicker();

		await open(user);
		await user.click(day("3 November 2026"));

		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	test("keeps the places of the days of other months but hides them", async () => {
		const { user } = renderPicker({ value: "2026-10-30" });

		await open(user);

		const lead = day("30 September 2026");
		expect(lead).toHaveAttribute("data-outside-month", "true");
		expect(lead).toHaveClass("outside-month:invisible");
	});

	test("shows every day's number in tabular figures", async () => {
		const { user } = renderPicker();

		await open(user);

		expect(day("2 November 2026")).toHaveClass("figures");
		expect(day("2 November 2026")).toHaveTextContent(/^2$/);
	});

	test.each([
		[undefined, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]],
		["monday", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]],
		["sunday", ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]],
		["saturday", ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]],
	] as const)(
		"with the week starting on %s, the columns are %j",
		async (firstDayOfWeek, columns) => {
			const { user } = renderPicker(firstDayOfWeek ? { firstDayOfWeek } : {});

			const dialog = await open(user);

			const names = Array.from(dialog.querySelectorAll("th")).map(
				(cell) => cell.textContent,
			);
			expect(names).toEqual(columns);
		},
	);

	// AC-F03-65
	test("with the week starting on Monday, 2 Nov is the first day of its row", async () => {
		const { user } = renderPicker({ firstDayOfWeek: "monday" });

		await open(user);

		const row = day("2 November 2026").closest("tr")!;
		expect(row.querySelector("td")).toContainElement(day("2 November 2026"));
	});

	test("names the month and the weekdays in the locale", async () => {
		const { user } = renderPicker({ locale: "de-DE", value: "2026-10-30" });

		const dialog = await open(user);

		expect(within(dialog).getByText("Oktober 2026")).toBeInTheDocument();
		expect(dialog.querySelector("th")).toHaveTextContent("Mo");
	});
});

describe("moving between months", () => {
	test("next is disabled in the month of the last day it can choose", async () => {
		const { user } = renderPicker();

		const dialog = await open(user);

		expect(
			within(dialog).getByRole("button", { name: "Next month" }),
		).toBeDisabled();
		expect(
			within(dialog).getByRole("button", { name: "Previous month" }),
		).toBeEnabled();
	});

	test("previous shows the month before, where previous is disabled at the first day", async () => {
		const { user } = renderPicker();

		const dialog = await open(user);
		await user.click(
			within(dialog).getByRole("button", { name: "Previous month" }),
		);

		expect(within(dialog).getByText("October 2026")).toBeInTheDocument();
		expect(
			within(dialog).getByRole("button", { name: "Previous month" }),
		).toBeDisabled();
		expect(
			within(dialog).getByRole("button", { name: "Next month" }),
		).toBeEnabled();
	});

	test("without a minimum or maximum both arrows stay enabled", async () => {
		const { user } = renderPicker({ minValue: "", maxValue: "" });

		const dialog = await open(user);

		expect(
			within(dialog).getByRole("button", { name: "Previous month" }),
		).toBeEnabled();
		expect(
			within(dialog).getByRole("button", { name: "Next month" }),
		).toBeEnabled();
		expect(day("3 November 2026")).not.toHaveAttribute("aria-disabled");
	});

	test("Page Up shows the month before, keeping the focus on a day it can choose", async () => {
		const { user } = renderPicker();

		const dialog = await open(user);
		await waitFor(() => expect(day("2 November 2026")).toHaveFocus());
		await user.keyboard("{PageUp}");

		expect(within(dialog).getByText("October 2026")).toBeInTheDocument();
		expect(day("23 October 2026")).toHaveFocus();
	});
});

describe("choosing", () => {
	test("a press on a day reports it, closes the popover and shows it on the button", async () => {
		const { user, onChange } = renderPicker();

		await open(user);
		await user.click(day("1 November 2026"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-11-01");
		await closed();
		expect(button("Date Yesterday, 1 Nov")).toBeInTheDocument();
	});

	test("focus goes back to the button after a choice", async () => {
		const { user } = renderPicker();

		await open(user);
		await user.click(day("1 November 2026"));

		await waitFor(() => expect(button()).toHaveFocus());
	});

	test("arrow keys move and Enter picks", async () => {
		const { user, onChange } = renderPicker();

		await open(user);
		await waitFor(() => expect(day("2 November 2026")).toHaveFocus());
		await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
		expect(day("30 October 2026")).toHaveFocus();
		await user.keyboard("{Enter}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-10-30");
		await closed();
		await waitFor(() => expect(button("Date Fri, 30 Oct")).toHaveFocus());
	});

	test("Space picks the focused day too", async () => {
		const { user, onChange } = renderPicker();

		await open(user);
		await waitFor(() => expect(day("2 November 2026")).toHaveFocus());
		await user.keyboard("{ArrowUp} ");

		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-10-26");
	});

	test("arrow keys stop at the first and last days it can choose", async () => {
		const { user } = renderPicker({ value: "2026-10-23" });

		await open(user);
		await waitFor(() => expect(day("23 October 2026")).toHaveFocus());
		await user.keyboard("{ArrowLeft}{ArrowUp}");
		expect(day("23 October 2026")).toHaveFocus();

		await user.keyboard("{ArrowRight>10/}");
		expect(day("2 November 2026")).toHaveFocus();
		await user.keyboard("{ArrowRight}{ArrowDown}");
		expect(day("2 November 2026")).toHaveFocus();
	});

	test("pressing the chosen day again reports it again and closes the popover", async () => {
		const { user, onChange } = renderPicker({ value: "2026-10-30" });

		await open(user);
		await user.click(day("30 October 2026"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-10-30");
		await closed();
	});

	test("Escape closes it without a change and puts focus back on the button", async () => {
		const { user, onChange } = renderPicker();

		await open(user);
		await waitFor(() => expect(day("2 November 2026")).toHaveFocus());
		await user.keyboard("{ArrowLeft}{Escape}");

		await closed();
		expect(onChange).not.toHaveBeenCalled();
		await waitFor(() => expect(button("Date Today, 2 Nov")).toHaveFocus());
	});

	test("a press outside closes it without a change", async () => {
		const { user, onChange } = renderPicker();

		await open(user);
		await user.click(
			screen.getByRole("button", { name: "Before", hidden: true }),
		);

		await closed();
		expect(onChange).not.toHaveBeenCalled();
	});

	test("opening again after moving away starts on the chosen day", async () => {
		const { user } = renderPicker();

		const dialog = await open(user);
		await user.click(
			within(dialog).getByRole("button", { name: "Previous month" }),
		);
		await user.keyboard("{Escape}");
		await closed();
		await open(user);

		await waitFor(() => expect(day("2 November 2026")).toHaveFocus());
		expect(screen.getByText("November 2026")).toBeInTheDocument();
	});
});

describe("following its props", () => {
	test("a new value from the caller shows on the button and in the calendar", async () => {
		const user = userEvent.setup();
		const props = {
			label: "Date",
			today: "2026-11-02",
			onChange: () => {},
		};
		const { rerender } = render(
			<I18nProvider locale="en-IN">
				<DatePicker
					{...props}
					value="2026-11-02"
					display="Today, 2 Nov"
				/>
			</I18nProvider>,
		);
		rerender(
			<I18nProvider locale="en-IN">
				<DatePicker
					{...props}
					value="2026-10-30"
					display="Fri, 30 Oct"
				/>
			</I18nProvider>,
		);

		expect(button("Date Fri, 30 Oct")).toBeInTheDocument();
		await open(user);
		expect(day("30 October 2026")).toBeInTheDocument();
	});

	test("a new window from the caller changes the days it can choose", async () => {
		const user = userEvent.setup();
		const props = {
			label: "Date",
			value: "2026-10-16",
			display: "Fri, 16 Oct",
			today: "2026-11-02",
			onChange: () => {},
		};
		const { rerender } = render(
			<I18nProvider locale="en-IN">
				<DatePicker
					{...props}
					minValue="2026-10-06"
					maxValue="2026-10-16"
				/>
			</I18nProvider>,
		);
		rerender(
			<I18nProvider locale="en-IN">
				<DatePicker
					{...props}
					minValue="2026-10-10"
					maxValue="2026-10-20"
				/>
			</I18nProvider>,
		);

		await open(user);
		expect(day("9 October 2026")).toHaveAttribute("aria-disabled");
		expect(day("20 October 2026")).not.toHaveAttribute("aria-disabled");
	});
});
