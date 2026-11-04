import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { describe, expect, test, vi } from "vitest";

import { DateField, type DateFieldProps } from "@/components/forms/DateField";

type Options = Partial<DateFieldProps> & { locale?: string };

/** Custom's From on the golden data (BR-F03-39), holding what the user types. */
function renderField({ locale = "en-IN", ...props }: Options = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [value, setValue] = useState(
			props.value === undefined ? "2026-10-05" : props.value,
		);
		return (
			<DateField
				label="From"
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
			<form aria-label="Range">
				<Harness />
			</form>
		</I18nProvider>,
	);
	return { ...view, user, onChange };
}

const group = (name = "From") => screen.getByRole("group", { name });
/** The text of what describes an element. React Aria adds a hidden "Selected Date: …" line,
 * which the matchers of jsdom's accessibility library do not read. */
const described = (element: HTMLElement) =>
	(element.getAttribute("aria-describedby") ?? "")
		.split(" ")
		.map((id) => document.getElementById(id)?.textContent)
		.filter(Boolean);
const part = (type: "day" | "month" | "year", label = "From") =>
	screen.getByRole("spinbutton", { name: `${type}, ${label}` });
/** The box's text without the direction marks the locale puts around it. */
const shown = (name = "From") => group(name).textContent!.replace(/[⁦-⁩]/g, "");

describe("showing a date", () => {
	test("is a group named by its label, with a day, a month and a year", () => {
		renderField();

		expect(group()).toBeInTheDocument();
		expect(part("day")).toHaveAttribute("aria-valuenow", "5");
		expect(part("month")).toHaveAttribute("aria-valuetext", "10 – October");
		expect(part("year")).toHaveAttribute("aria-valuenow", "2026");
	});

	test.each([
		["en-IN", "5/10/2026"],
		["en-US", "10/5/2026"],
		["de-DE", "5.10.2026"],
		["en-GB", "05/10/2026"],
	])(
		"in %s the parts read %s, in the locale's order (BR-F02-19)",
		(locale, text) => {
			renderField({ locale });

			expect(shown()).toBe(text);
		},
	);

	test("an empty date shows each part's placeholder in the third ink", () => {
		renderField({ value: null });

		expect(shown()).toBe("dd/mm/yyyy");
		expect(part("day")).toHaveAttribute("data-placeholder", "true");
		expect(part("day")).toHaveClass("placeholder:text-ink-3");
		expect(part("day")).toHaveAttribute("aria-valuetext", "Empty");
	});

	test("shows its digits in tabular figures", () => {
		renderField();

		expect(part("year")).toHaveClass("figures");
	});

	test("the box looks like a text box, at 16px on touch screens", () => {
		renderField();

		expect(group()).toHaveClass(
			"rounded-control",
			"border-edge",
			"min-h-10.5",
			"pointer-coarse:text-base",
		);
	});

	test("submits the date with a form under its name", () => {
		renderField({ name: "from" });

		const form = screen.getByRole("form") as HTMLFormElement;
		expect(new FormData(form).get("from")).toBe("2026-10-05");
	});

	test("marks the label (optional) when asked", () => {
		renderField({ optional: true });

		expect(screen.getByText("(optional)")).toBeInTheDocument();
	});

	test("puts the caller's classes on the root, after its own", () => {
		renderField({ className: "flex-1" });

		expect(
			group().closest("[data-rac]")!.parentElement!.closest("[data-rac]"),
		).toHaveClass("flex", "flex-col", "flex-1");
	});
});

describe("typing", () => {
	test("digits fill the parts in turn, and the date is reported once complete", async () => {
		const { user, onChange } = renderField({ value: null });

		await user.click(part("day"));
		await user.keyboard("20");
		expect(part("month")).toHaveFocus();
		await user.keyboard("10");
		expect(onChange).not.toHaveBeenCalled();
		await user.keyboard("2026");

		expect(onChange).toHaveBeenLastCalledWith("2026-10-20");
		expect(shown()).toBe("20/10/2026");
	});

	test("Arrow Up steps the focused part and reports the new date", async () => {
		const { user, onChange } = renderField();

		await user.click(part("day"));
		await user.keyboard("{ArrowUp}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-10-06");
	});

	test("Arrow Down on the month steps it back", async () => {
		const { user, onChange } = renderField();

		await user.click(part("month"));
		await user.keyboard("{ArrowDown}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-09-05");
	});

	test("the day wraps at the month's end without changing the month", async () => {
		const { user, onChange } = renderField({ value: "2026-10-31" });

		await user.click(part("day"));
		await user.keyboard("{ArrowUp}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-10-01");
	});

	test("a part cleared with Backspace shows its placeholder and keeps the last date", async () => {
		const { user, onChange } = renderField();

		await user.click(part("day"));
		await user.keyboard("{Backspace}");

		expect(part("day")).toHaveAttribute("data-placeholder", "true");
		expect(shown()).toBe("dd/10/2026");
		expect(onChange).not.toHaveBeenCalled();
	});

	test("a cleared part typed again reports the new date", async () => {
		const { user, onChange } = renderField();

		await user.click(part("day"));
		await user.keyboard("{Backspace}12");

		expect(onChange).toHaveBeenLastCalledWith("2026-10-12");
	});

	test("every part cleared reports no date", async () => {
		const { user, onChange } = renderField();

		await user.click(part("day"));
		await user.keyboard("{Backspace}");
		await user.click(part("month"));
		await user.keyboard("{Backspace}{Backspace}");
		await user.click(part("year"));
		await user.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}");

		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(shown()).toBe("dd/mm/yyyy");
	});

	test("letters are ignored", async () => {
		const { user, onChange } = renderField();

		await user.click(part("day"));
		await user.keyboard("ab");

		expect(onChange).not.toHaveBeenCalled();
		expect(shown()).toBe("5/10/2026");
	});

	test("Tab moves through the parts, then out", async () => {
		const { user } = renderField();

		await user.tab();
		expect(part("day")).toHaveFocus();
		await user.tab();
		expect(part("month")).toHaveFocus();
		await user.tab();
		expect(part("year")).toHaveFocus();
		await user.tab();
		expect(document.body).toHaveFocus();
	});

	test("the focused part is filled with the accent", async () => {
		const { user } = renderField();

		await user.click(part("month"));

		expect(part("month")).toHaveAttribute("data-focused", "true");
		expect(part("month")).toHaveClass(
			"focused:bg-accent",
			"focused:text-on-accent",
		);
	});
});

describe("hint, error and disabled", () => {
	test("the hint shows under the box and describes it", () => {
		renderField({ hint: "The first day of the range." });

		expect(described(group())).toContain("The first day of the range.");
		expect(described(part("day"))).toContain("The first day of the range.");
	});

	test("an error replaces the hint, marks it invalid and is read out", () => {
		renderField({
			hint: "The first day of the range.",
			error: "Choose a date on or before To.",
		});

		expect(group()).toHaveAttribute("data-invalid", "true");
		expect(group()).toHaveClass("invalid:border-neg");
		expect(part("day")).toHaveAttribute("aria-invalid", "true");
		expect(described(group())).toContain("Choose a date on or before To.");
		expect(
			screen.queryByText("The first day of the range."),
		).not.toBeInTheDocument();
	});

	test("without an error it is not invalid", () => {
		renderField();

		expect(group()).not.toHaveAttribute("data-invalid");
		expect(part("day")).not.toHaveAttribute("aria-invalid");
	});

	test("disabled, its parts cannot be focused or changed", async () => {
		const { user, onChange } = renderField({ isDisabled: true });

		await user.tab();
		expect(part("day")).not.toHaveFocus();
		await user.click(part("day"));
		await user.keyboard("{ArrowUp}");

		expect(onChange).not.toHaveBeenCalled();
		expect(group()).toHaveAttribute("data-disabled", "true");
		expect(group()).toHaveClass("disabled:bg-soft");
	});
});

describe("following its props", () => {
	test("a new value from the caller replaces the shown date", () => {
		const { rerender } = render(
			<I18nProvider locale="en-IN">
				<DateField
					label="From"
					value="2026-10-05"
					onChange={() => {}}
				/>
			</I18nProvider>,
		);
		rerender(
			<I18nProvider locale="en-IN">
				<DateField
					label="From"
					value="2026-08-25"
					onChange={() => {}}
				/>
			</I18nProvider>,
		);

		expect(shown()).toBe("25/8/2026");
	});

	test("a value cleared by the caller shows the placeholders", () => {
		const { rerender } = render(
			<I18nProvider locale="en-IN">
				<DateField
					label="From"
					value="2026-10-05"
					onChange={() => {}}
				/>
			</I18nProvider>,
		);
		rerender(
			<I18nProvider locale="en-IN">
				<DateField
					label="From"
					value={null}
					onChange={() => {}}
				/>
			</I18nProvider>,
		);

		expect(shown()).toBe("dd/mm/yyyy");
	});
});
