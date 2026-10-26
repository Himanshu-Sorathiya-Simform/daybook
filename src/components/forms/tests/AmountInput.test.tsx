import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { AmountInput } from "@/components/forms/AmountInput";

describe("default", () => {
	test("is named by its label and shows the currency sign in the user's format", () => {
		const { rerender } = render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale="hi-IN-u-nu-latn"
			/>,
		);
		expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
		expect(screen.getByText("₹")).toBeInTheDocument();

		rerender(
			<AmountInput
				label="Amount"
				currency="EUR"
				numberLocale="de-DE-u-nu-latn"
			/>,
		);
		expect(screen.getByText("€")).toBeInTheDocument();
	});

	test("passes the text through exactly as typed, in the user's own format", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<AmountInput
				label="Amount"
				currency="EUR"
				numberLocale="de-DE-u-nu-latn"
				onChange={onChange}
			/>,
		);

		await user.type(screen.getByRole("textbox", { name: "Amount" }), "1.240,50");

		expect(onChange).toHaveBeenLastCalledWith("1.240,50");
	});

	test("can take focus on render", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale="hi-IN-u-nu-latn"
				autoFocus
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveFocus();
	});
});

describe("phone keyboard", () => {
	// BR-F03-04: decimal pad, or the number pad for a currency with no decimals.
	test("is the decimal pad for a currency with decimals", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale="hi-IN-u-nu-latn"
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveAttribute(
			"inputmode",
			"decimal",
		);
	});

	test("is the number pad for JPY", () => {
		render(
			<AmountInput
				label="Amount"
				currency="JPY"
				numberLocale="ja-JP-u-nu-latn"
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveAttribute(
			"inputmode",
			"numeric",
		);
	});
});

describe("invalid", () => {
	test("marks the input invalid and reads the error", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale="hi-IN-u-nu-latn"
				error="Enter an amount."
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Amount" });
		expect(input).toBeInvalid();
		expect(input).toHaveAccessibleDescription("Enter an amount.");
	});
});
