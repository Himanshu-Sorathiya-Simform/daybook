import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import type { PayeeItem } from "@/lib/transactions/answers";
import { payeeChoices } from "../../lib/payees";
import { PayeeField, type PayeeFieldProps } from "../PayeeField";

const payee = (
	name: string,
	count: number,
	category = "entertainment" as const,
): PayeeItem => ({
	payee: name,
	count,
	lastUsedOn: "2026-10-05",
	lastType: "expense",
	lastCategory: category,
	lastExpense: { amountMinor: 64900, category },
});

const LIST = [
	payee("Netflix", 3),
	payee("Netflix Premium", 1),
	payee("Spotify", 12, "entertainment"),
];

/** The field with the text and the choices held as the dialog holds them. */
function Held(props: Partial<PayeeFieldProps>) {
	const [value, setValue] = useState("");
	return (
		<PayeeField
			value={value}
			onChange={setValue}
			choices={payeeChoices(LIST, value)}
			{...props}
			// The dialog fills the name of the payee that was chosen.
			onChoose={(item) => {
				setValue(item.payee);
				props.onChoose?.(item);
			}}
		/>
	);
}

function setup(props: Partial<PayeeFieldProps> = {}) {
	renderInApp(<Held {...props} />);
	return userEvent.setup();
}

const box = () => screen.getByRole("combobox", { name: "Name" });

describe("the Name box of an Add (BR-F05-24)", () => {
	test("is a combobox named Name with its placeholder", () => {
		setup();
		expect(box()).toHaveAttribute("placeholder", "Netflix, rent, insurance…");
	});

	test("focused while empty it lists Payees you've paid", async () => {
		const user = setup();
		await user.click(box());
		const list = screen.getByRole("listbox");
		expect(within(list).getByText("Payees you've paid")).toBeVisible();
		expect(within(list).getAllByRole("option")).toHaveLength(3);
	});

	test("each option shows its payee, its category and how many times", async () => {
		const user = setup();
		await user.click(box());
		expect(
			screen.getByRole("option", {
				name: /Netflix\s*Entertainment · 3 times/,
			}),
		).toBeVisible();
		expect(
			screen.getByRole("option", {
				name: /Netflix Premium\s*Entertainment · 1 time$/,
			}),
		).toBeVisible();
		expect(
			screen.getByRole("option", {
				name: /Spotify\s*Entertainment · 12 times/,
			}),
		).toBeVisible();
	});

	test("typing narrows the list to the matches", async () => {
		const user = setup();
		await user.type(box(), "spo");
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(1);
		expect(options[0]).toHaveTextContent("Spotify");
	});

	test("text with no match lists nothing and offers no new payee", async () => {
		const user = setup();
		await user.type(box(), "Brand new");
		expect(screen.queryByRole("listbox")).toBeNull();
		expect(screen.queryByText(/as a new payee/)).toBeNull();
		expect(box()).toHaveValue("Brand new");
	});

	test("any text can be kept as the name", async () => {
		const user = setup();
		await user.type(box(), "Rent");
		await user.tab();
		expect(box()).toHaveValue("Rent");
	});

	test("choosing an option hands the payee to the dialog and fills its name", async () => {
		const onChoose = vi.fn();
		const user = setup({ onChoose });
		await user.click(box());
		await user.click(screen.getByRole("option", { name: /Spotify/ }));
		expect(onChoose).toHaveBeenCalledExactlyOnceWith(LIST[2]);
		expect(box()).toHaveValue("Spotify");
	});

	test("the keyboard chooses: Down then Enter", async () => {
		const onChoose = vi.fn();
		const user = setup({ onChoose });
		await user.click(box());
		await user.keyboard("{ArrowDown}{Enter}");
		expect(onChoose).toHaveBeenCalledExactlyOnceWith(LIST[0]);
	});

	test("Escape closes the list first", async () => {
		const user = setup();
		await user.click(box());
		expect(screen.getByRole("listbox")).toBeVisible();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	test("the list has no keyboard-hint footer of the Transaction field", async () => {
		const user = setup();
		await user.click(box());
		expect(screen.queryByText(/Recent and frequent/)).toBeNull();
	});
});

describe("its states", () => {
	test("shows the hint", () => {
		setup({
			hint: "Filled from your last Netflix expense: Entertainment, ₹649.00.",
		});
		expect(
			screen.getByText(
				"Filled from your last Netflix expense: Entertainment, ₹649.00.",
			),
		).toBeVisible();
	});

	test("an error replaces the hint and marks the box invalid", () => {
		setup({ hint: "A hint", error: "Enter a name, like Netflix or Rent." });
		expect(
			screen.getByText("Enter a name, like Netflix or Rent."),
		).toBeVisible();
		expect(screen.queryByText("A hint")).toBeNull();
		expect(box()).toBeInvalid();
	});

	test("with no error the box is valid", () => {
		setup();
		expect(box()).toBeValid();
	});

	test("takes focus when asked", () => {
		setup({ autoFocus: true });
		expect(box()).toHaveFocus();
	});

	test("does not take focus unasked", () => {
		setup();
		expect(box()).not.toHaveFocus();
	});

	test("a disabled box cannot be typed in", () => {
		setup({ isDisabled: true });
		expect(box()).toBeDisabled();
	});

	test("with nothing to list there is no list", async () => {
		const user = setup({ choices: [] });
		await user.click(box());
		expect(screen.queryByRole("listbox")).toBeNull();
	});
});
