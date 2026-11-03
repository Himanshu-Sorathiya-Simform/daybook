import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ONBOARDING_TEXT } from "../../lib/messages";
import { WeekStartField } from "../WeekStartField";

const group = () => screen.getByRole("radiogroup", { name: "Week starts on" });

describe("WeekStartField (F02 section 6)", () => {
	test("offers Monday, Sunday and Saturday, the value chosen", () => {
		render(
			<WeekStartField
				value="sunday"
				onChange={vi.fn()}
			/>,
		);
		expect(
			within(group())
				.getAllByRole("radio")
				.map((radio) => radio.closest("label")?.textContent),
		).toEqual(["Monday", "Sunday", "Saturday"]);
		expect(within(group()).getByRole("radio", { name: "Sunday" })).toBeChecked();
	});

	test("shows the label and reads the hint with the choice", () => {
		render(
			<WeekStartField
				value="monday"
				onChange={vi.fn()}
			/>,
		);
		expect(
			screen.getByText("Week starts on", { selector: "span" }),
		).toBeInTheDocument();
		expect(group()).toHaveAccessibleDescription(ONBOARDING_TEXT.weekStartHint);
	});

	test("reports the day picked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<WeekStartField
				value="monday"
				onChange={onChange}
			/>,
		);
		await user.click(within(group()).getByRole("radio", { name: "Saturday" }));
		expect(onChange).toHaveBeenCalledExactlyOnceWith("saturday");
	});

	test("an error replaces the hint and is read with the choice", () => {
		render(
			<WeekStartField
				value="monday"
				onChange={vi.fn()}
				error="Choose the first day of your week."
			/>,
		);
		expect(group()).toHaveAccessibleDescription(
			"Choose the first day of your week.",
		);
		expect(screen.getByText("Choose the first day of your week.")).toHaveClass(
			"text-neg",
		);
	});

	test("disabled, no day can be picked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<WeekStartField
				value="monday"
				onChange={onChange}
				isDisabled
			/>,
		);
		await user.click(within(group()).getByRole("radio", { name: "Sunday" }));
		expect(onChange).not.toHaveBeenCalled();
	});
});
