import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import { DIALOG_TEXT } from "../../lib/dialog";
import type { Formats } from "../../lib/labels";
import { ForHowLongField, type ForHowLongFieldProps } from "../ForHowLongField";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

function setup(props: Partial<ForHowLongFieldProps> = {}) {
	const onChange = vi.fn();
	render(
		<ForHowLongField
			value="onward"
			onChange={onChange}
			record={goldenBudget("food")}
			month="2026-11"
			current="2026-11"
			formats={IN}
			{...props}
		/>,
	);
	return { onChange, user: userEvent.setup() };
}

describe("ForHowLongField (BR-F04-19, D-560)", () => {
	test("offers from the month onward, and that month only", () => {
		setup();
		expect(
			screen.getByRole("radiogroup", { name: DIALOG_TEXT.forHowLong }),
		).toBeVisible();
		expect(
			screen.getByRole("radio", { name: new RegExp(DIALOG_TEXT.onward) }),
		).toBeChecked();
		expect(
			screen.getByRole("radio", { name: new RegExp(DIALOG_TEXT.oneMonth) }),
		).not.toBeChecked();
	});

	test("says what each choice does", () => {
		setup();
		expect(screen.getByText(DIALOG_TEXT.onwardDetail)).toBeVisible();
	});

	test("choosing the one month reports it", async () => {
		const { user, onChange } = setup();
		await user.click(
			screen.getByRole("radio", { name: new RegExp(DIALOG_TEXT.oneMonth) }),
		);
		expect(onChange).toHaveBeenCalledExactlyOnceWith("month");
	});

	test("shows the one-month choice as chosen", () => {
		setup({ value: "month" });
		expect(
			screen.getByRole("radio", { name: new RegExp(DIALOG_TEXT.oneMonth) }),
		).toBeChecked();
	});

	test("disabled, it takes no choice", async () => {
		const { user, onChange } = setup({ isDisabled: true });
		await user.click(
			screen.getByRole("radio", { name: new RegExp(DIALOG_TEXT.oneMonth) }),
		);
		expect(onChange).not.toHaveBeenCalled();
	});
});
