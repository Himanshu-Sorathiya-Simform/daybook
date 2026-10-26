import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Search } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import { TextInput } from "@/components/forms/TextInput";

describe("default", () => {
	test("is named by its visible label", () => {
		render(<TextInput label="Description" />);

		expect(
			screen.getByRole("textbox", { name: "Description" }),
		).toBeInTheDocument();
	});

	test("passes what the user types to onChange as text", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<TextInput
				label="Description"
				onChange={onChange}
			/>,
		);

		await user.type(
			screen.getByRole("textbox", { name: "Description" }),
			"Rent",
		);

		expect(onChange).toHaveBeenLastCalledWith("Rent");
	});

	test("shows the optional mark and the counter", () => {
		render(
			<TextInput
				label="Description"
				optional
				counter="31 / 500"
			/>,
		);

		expect(screen.getByText("(optional)")).toBeVisible();
		expect(screen.getByText("31 / 500")).toBeVisible();
	});

	test("shows a decorative icon and a placeholder that is not the label", () => {
		render(
			<TextInput
				label="Search"
				icon={Search}
				placeholder="Payee, note or amount"
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Search" });
		expect(input).toHaveAttribute("placeholder", "Payee, note or amount");
		expect(input.parentElement?.querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	test("puts the caller's classes on the root element", () => {
		const { container } = render(
			<TextInput
				label="Description"
				className="col-span-2"
			/>,
		);

		expect(container.firstElementChild).toHaveClass("col-span-2");
	});
});

describe("multiline", () => {
	test("is a text area with the given number of rows", () => {
		render(
			<TextInput
				label="Note"
				multiline
				rows={5}
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Note" })).toHaveAttribute(
			"rows",
			"5",
		);
		expect(screen.getByRole("textbox", { name: "Note" }).tagName).toBe(
			"TEXTAREA",
		);
	});
});

describe("hint and error", () => {
	test("reads the hint with the input", () => {
		render(
			<TextInput
				label="Description"
				hint="Shown under the payee in your list."
			/>,
		);

		expect(
			screen.getByRole("textbox", { name: "Description" }),
		).toHaveAccessibleDescription("Shown under the payee in your list.");
	});

	test("marks the input invalid and reads the error instead of the hint", () => {
		render(
			<TextInput
				label="Description"
				hint="Shown under the payee in your list."
				error="Too long."
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Description" });
		expect(input).toBeInvalid();
		expect(input).toHaveAccessibleDescription("Too long.");
		expect(
			screen.queryByText("Shown under the payee in your list."),
		).not.toBeInTheDocument();
	});
});

describe("disabled", () => {
	test("cannot be typed in", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<TextInput
				label="Description"
				isDisabled
				onChange={onChange}
			/>,
		);

		await user.type(
			screen.getByRole("textbox", { name: "Description" }),
			"Rent",
		);

		expect(screen.getByRole("textbox", { name: "Description" })).toBeDisabled();
		expect(onChange).not.toHaveBeenCalled();
	});
});
