import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { AmountInput } from "@/components/forms/AmountInput";
import type { CurrencyCode } from "@/lib/currency";

const IN = "hi-IN-u-nu-latn";
const DE = "de-DE-u-nu-latn";

describe("label", () => {
	test("names the input, and pressing it focuses the input", async () => {
		const user = userEvent.setup();
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
			/>,
		);

		await user.click(screen.getByText("Amount"));

		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveFocus();
	});

	test("does not read the currency sign as part of the name", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByRole("textbox")).toHaveAccessibleName("Amount");
		expect(screen.getByText("₹")).toHaveAttribute("aria-hidden", "true");
	});
});

describe("currency sign", () => {
	test.each([
		["INR", IN, "₹"],
		["USD", "en-US-u-nu-latn", "$"],
		["EUR", DE, "€"],
		["GBP", "en-GB-u-nu-latn", "£"],
		["JPY", "ja-JP-u-nu-latn", "￥"],
	] as [CurrencyCode, string, string][])(
		"%s in %s is %s",
		(currency, numberLocale, sign) => {
			render(
				<AmountInput
					label="Amount"
					currency={currency}
					numberLocale={numberLocale}
				/>,
			);

			expect(screen.getByText(sign)).toBeVisible();
		},
	);

	test("follows a new currency when it changes", () => {
		const { rerender } = render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
			/>,
		);

		rerender(
			<AmountInput
				label="Amount"
				currency="EUR"
				numberLocale={DE}
			/>,
		);

		expect(screen.getByText("€")).toBeVisible();
		expect(screen.queryByText("₹")).not.toBeInTheDocument();
	});
});

describe("typing", () => {
	test.each(["640", "1,240.50", "1.240,50", "1 240,50", "1,23,456.50", "12abc"])(
		"passes %s through exactly as typed, without filtering or parsing",
		async (text) => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<AmountInput
					label="Amount"
					currency="EUR"
					numberLocale={DE}
					onChange={onChange}
				/>,
			);

			await user.type(screen.getByRole("textbox", { name: "Amount" }), text);

			expect(onChange).toHaveBeenLastCalledWith(text);
			expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue(
				text,
			);
		},
	);

	test("shows a default value", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				defaultValue="640"
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("640");
	});

	test("is controlled: the parent can reformat what was typed", async () => {
		const user = userEvent.setup();
		function Controlled() {
			const [value, setValue] = useState("");
			return (
				<AmountInput
					label="Amount"
					currency="INR"
					numberLocale={IN}
					value={value}
					onChange={(next) => setValue(next.replace(/[^\d.]/g, ""))}
				/>
			);
		}
		render(<Controlled />);

		await user.type(screen.getByRole("textbox", { name: "Amount" }), "1,2x0");

		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("120");
	});

	test("can take focus on render and reports blur, so a form can reformat on blur", async () => {
		const user = userEvent.setup();
		const onBlur = vi.fn();
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				autoFocus
				onBlur={onBlur}
			/>,
		);
		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveFocus();

		await user.tab();

		expect(onBlur).toHaveBeenCalledOnce();
	});

	test("takes its value into a submitted form under its name", () => {
		render(
			<form data-testid="form">
				<AmountInput
					label="Amount"
					currency="INR"
					numberLocale={IN}
					name="amount"
					defaultValue="640"
				/>
			</form>,
		);

		const form = screen.getByTestId("form") as HTMLFormElement;
		expect(new FormData(form).get("amount")).toBe("640");
	});
});

describe("phone keyboard (BR-F03-04)", () => {
	test.each([
		["INR", "decimal"],
		["USD", "decimal"],
		["EUR", "decimal"],
		["GBP", "decimal"],
		["KWD", "decimal"],
		["JPY", "numeric"],
	] as [CurrencyCode, string][])("%s uses the %s pad", (currency, mode) => {
		render(
			<AmountInput
				label="Amount"
				currency={currency}
				numberLocale="en-US-u-nu-latn"
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveAttribute(
			"inputmode",
			mode,
		);
	});
});

describe("optional, counter, hint and error", () => {
	test("shows the optional mark and the counter", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				optional
				counter="0 / 12"
			/>,
		);

		expect(screen.getByText("(optional)")).toBeVisible();
		expect(screen.getByText("0 / 12")).toBeVisible();
	});

	test("reads the hint with the input", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				hint="Up to 2 decimals."
			/>,
		);

		expect(
			screen.getByRole("textbox", { name: "Amount" }),
		).toHaveAccessibleDescription("Up to 2 decimals.");
	});

	test("is valid by default", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Amount" })).toBeValid();
	});

	test("marks the input invalid, reads the error instead of the hint and draws a red edge", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				hint="Up to 2 decimals."
				error="Enter an amount."
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Amount" });
		expect(input).toBeInvalid();
		expect(input).toHaveAccessibleDescription("Enter an amount.");
		expect(screen.queryByText("Up to 2 decimals.")).not.toBeInTheDocument();
		expect(input.parentElement).toHaveClass("invalid:border-neg");
	});
});

describe("required, read only and disabled", () => {
	test("is marked required", () => {
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				isRequired
			/>,
		);

		expect(screen.getByRole("textbox", { name: /Amount/ })).toBeRequired();
	});

	test("a read-only amount cannot be changed", async () => {
		const user = userEvent.setup();
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				isReadOnly
				defaultValue="640"
			/>,
		);

		await user.type(screen.getByRole("textbox", { name: "Amount" }), "1");

		expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("640");
	});

	test("a disabled amount cannot be typed in and has the soft background", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				isDisabled
				onChange={onChange}
			/>,
		);
		const input = screen.getByRole("textbox", { name: "Amount" });

		await user.type(input, "1");

		expect(input).toBeDisabled();
		expect(onChange).not.toHaveBeenCalled();
		expect(input.parentElement).toHaveClass("disabled:bg-soft");
	});
});

describe("look", () => {
	test("is a 56px box with large tabular figures, and the focus ring moves to the box", async () => {
		const user = userEvent.setup();
		render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
			/>,
		);
		const input = screen.getByRole("textbox", { name: "Amount" });

		expect(input).toHaveClass("figures", "text-figure");
		expect(input.parentElement).toHaveClass("h-14", "focus-within:focus-ring");

		await user.tab();
		expect(input.parentElement).toHaveAttribute("data-focus-within", "true");
	});
});

describe("className", () => {
	test("goes on the root element", () => {
		const { container } = render(
			<AmountInput
				label="Amount"
				currency="INR"
				numberLocale={IN}
				className="w-60"
			/>,
		);

		expect(container.firstElementChild).toHaveClass("w-60");
	});
});
