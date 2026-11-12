import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { describe, expect, test, vi } from "vitest";

import { TimeField, type TimeFieldProps } from "@/components/forms/TimeField";

type Options = Partial<TimeFieldProps> & { locale?: string };

/** The entry dialog's time, holding what the user types (BR-F03-49). */
function renderField({ locale = "en-IN", ...props }: Options = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [value, setValue] = useState(
			props.value === undefined ? "23:50" : props.value,
		);
		return (
			<TimeField
				label="Time"
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
			<form aria-label="Entry">
				<Harness />
			</form>
		</I18nProvider>,
	);
	return { ...view, user, onChange };
}

const group = () => screen.getByRole("group", { name: "Time" });
const part = (type: "hour" | "minute" | "am/pm") =>
	screen.getByRole("spinbutton", { name: `${type}, Time` });
/** A part by its kind, for a locale that names its parts in another language. */
const segment = (type: "hour" | "minute" | "dayPeriod") =>
	group().querySelector<HTMLElement>(`[role="spinbutton"][data-type="${type}"]`);
/** The box's text without the direction marks the locale puts around it. */
const shown = () => group().textContent!.replace(/[⁦-⁩]/g, "");
const described = (element: HTMLElement) =>
	(element.getAttribute("aria-describedby") ?? "")
		.split(" ")
		.map((id) => document.getElementById(id)?.textContent)
		.filter(Boolean);

describe("the hour cycle follows the locale (BR-F02-19)", () => {
	// AC-F03-67
	test.each([
		["en-IN", "11:50 pm"],
		["en-US", "11:50 PM"],
		["de-DE", "23:50"],
		["en-GB", "23:50"],
	])("in %s 23:50 reads %s", (locale, text) => {
		renderField({ locale });

		expect(shown()).toBe(text);
	});

	test("a 12-hour locale has an am/pm part, read out with the hour", () => {
		renderField();

		expect(part("hour")).toHaveAttribute("aria-valuetext", "11 pm");
		expect(part("am/pm")).toHaveAttribute("aria-valuetext", "pm");
	});

	test("a 24-hour locale has no am/pm part", () => {
		renderField({ locale: "de-DE" });

		expect(segment("dayPeriod")).toBeNull();
		expect(segment("hour")).toHaveAttribute("aria-valuenow", "23");
	});

	test("a morning time reads am", () => {
		renderField({ value: "09:05" });

		expect(shown()).toBe("9:05 am");
	});

	test("midnight reads 12:00 am, and noon 12:00 pm", () => {
		const { unmount } = renderField({ value: "00:00" });
		expect(shown()).toBe("12:00 am");
		unmount();

		renderField({ value: "12:00" });
		expect(shown()).toBe("12:00 pm");
	});
});

describe("showing a time", () => {
	test("is a group named by its label, to the minute", () => {
		renderField();

		expect(group()).toBeInTheDocument();
		expect(part("minute")).toHaveAttribute("aria-valuenow", "50");
		expect(
			screen.queryByRole("spinbutton", { name: /second/ }),
		).not.toBeInTheDocument();
	});

	test("no time shows the placeholders", () => {
		renderField({ value: null });

		expect(shown()).toBe("––:–– am");
		expect(part("hour")).toHaveAttribute("data-placeholder", "true");
	});

	test("submits the time with a form under its name", () => {
		renderField({ name: "time" });

		const form = screen.getByRole("form") as HTMLFormElement;
		expect(new FormData(form).get("time")).toBe("23:50:00");
	});

	test("the box is at 16px on touch screens", () => {
		renderField();

		expect(group()).toHaveClass("pointer-coarse:text-base", "min-h-10.5");
	});
});

describe("typing", () => {
	test("Arrow Up on the minute reports the next minute as HH:mm", async () => {
		const { user, onChange } = renderField();

		await user.click(part("minute"));
		await user.keyboard("{ArrowUp}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith("23:51");
		expect(shown()).toBe("11:51 pm");
	});

	test("the minute wraps at 59 without changing the hour", async () => {
		const { user, onChange } = renderField({ value: "23:59" });

		await user.click(part("minute"));
		await user.keyboard("{ArrowUp}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith("23:00");
	});

	test("typing an hour keeps the half of the day", async () => {
		const { user, onChange } = renderField();

		await user.click(part("hour"));
		await user.keyboard("9");

		expect(onChange).toHaveBeenLastCalledWith("21:50");
	});

	test("A on the am/pm part moves the time to the morning", async () => {
		const { user, onChange } = renderField();

		await user.click(part("am/pm"));
		await user.keyboard("a");

		expect(onChange).toHaveBeenLastCalledWith("11:50");
		expect(shown()).toBe("11:50 am");
	});

	test("in a 24-hour locale two digits set the hour", async () => {
		const { user, onChange } = renderField({ locale: "de-DE", value: "08:15" });

		await user.click(segment("hour")!);
		await user.keyboard("17");

		expect(onChange).toHaveBeenLastCalledWith("17:15");
		expect(shown()).toBe("17:15");
	});

	test("an empty time is reported once the hour and minute are typed, in the morning until pm", async () => {
		const { user, onChange } = renderField({ value: null });

		await user.click(part("hour"));
		await user.keyboard("7");
		expect(onChange).not.toHaveBeenCalled();
		await user.keyboard("05");
		expect(onChange).toHaveBeenLastCalledWith("07:05");
		await user.keyboard("p");

		expect(onChange).toHaveBeenLastCalledWith("19:05");
		expect(shown()).toBe("7:05 pm");
	});

	test("a cleared part keeps the last time; every part cleared reports none", async () => {
		const { user, onChange } = renderField({ value: "09:05" });

		await user.click(part("hour"));
		await user.keyboard("{Backspace}");
		expect(part("hour")).toHaveAttribute("data-placeholder", "true");
		expect(onChange).not.toHaveBeenCalled();
		await user.click(part("minute"));
		await user.keyboard("{Backspace}{Backspace}");
		await user.click(part("am/pm"));
		await user.keyboard("{Backspace}");

		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(shown()).toBe("––:–– am");
	});

	test("Tab moves from hour to minute to am/pm, then out", async () => {
		const { user } = renderField();

		await user.tab();
		expect(part("hour")).toHaveFocus();
		await user.tab();
		expect(part("minute")).toHaveFocus();
		await user.tab();
		expect(part("am/pm")).toHaveFocus();
		await user.tab();
		expect(document.body).toHaveFocus();
	});
});

describe("hint, error and disabled", () => {
	test("the hint describes it", () => {
		renderField({ hint: "In your time zone." });

		expect(described(group())).toContain("In your time zone.");
	});

	test("an error marks it invalid, replaces the hint and is read out (BR-F03-09)", () => {
		renderField({
			hint: "In your time zone.",
			error: "The time can't be in the future.",
		});

		expect(group()).toHaveAttribute("data-invalid", "true");
		expect(part("hour")).toHaveAttribute("aria-invalid", "true");
		expect(described(group())).toContain("The time can't be in the future.");
		expect(screen.queryByText("In your time zone.")).not.toBeInTheDocument();
	});

	test("without an error it is not invalid", () => {
		renderField();

		expect(group()).not.toHaveAttribute("data-invalid");
	});

	test("disabled, it cannot be focused or changed", async () => {
		const { user, onChange } = renderField({ isDisabled: true });

		await user.tab();
		await user.click(part("minute"));
		await user.keyboard("{ArrowUp}");

		expect(part("minute")).not.toHaveFocus();
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("following its props", () => {
	test("a new value from the caller replaces the shown time", () => {
		const { rerender } = render(
			<I18nProvider locale="en-IN">
				<TimeField
					label="Time"
					value="23:50"
					onChange={() => {}}
				/>
			</I18nProvider>,
		);
		rerender(
			<I18nProvider locale="en-IN">
				<TimeField
					label="Time"
					value="07:30"
					onChange={() => {}}
				/>
			</I18nProvider>,
		);

		expect(shown()).toBe("7:30 am");
	});
});
