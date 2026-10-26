import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { ChoiceGroup, type ChoiceGroupProps } from "@/components/forms/ChoiceGroup";

const options = [
	{ value: "newest", label: "Newest first" },
	{
		value: "oldest",
		label: "Oldest first",
		description: "Starts from the first day",
	},
	{ value: "largest", label: "Largest amount", count: 12 },
];

function Controlled({
	onChange,
	...props
}: Partial<Omit<ChoiceGroupProps, "value" | "onChange">> & {
	onChange?: (value: string) => void;
}) {
	const [value, setValue] = useState<string | null>("newest");
	return (
		<ChoiceGroup
			label="Sort"
			options={options}
			{...props}
			value={value}
			onChange={(next) => {
				setValue(next);
				onChange?.(next);
			}}
		/>
	);
}

describe("default", () => {
	test("is a radio group named by its label, with the chosen option checked", () => {
		render(<Controlled />);

		expect(screen.getByRole("radiogroup", { name: "Sort" })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "Newest first" })).toBeChecked();
		expect(
			screen.getByRole("radio", { name: "Oldest first" }),
		).not.toBeChecked();
	});

	test("chooses an option on click and reports its value", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByRole("radio", { name: "Oldest first" }));

		expect(onChange).toHaveBeenCalledWith("oldest");
		expect(screen.getByRole("radio", { name: "Oldest first" })).toBeChecked();
		expect(
			screen.getByRole("radio", { name: "Newest first" }),
		).not.toBeChecked();
	});

	test("starts with nothing chosen when the value is null", () => {
		render(
			<ChoiceGroup
				label="Sort"
				options={options}
				value={null}
				onChange={() => {}}
			/>,
		);

		expect(
			screen
				.getAllByRole("radio")
				.every((radio) => !(radio as HTMLInputElement).checked),
		).toBe(true);
	});

	test("shows the count and reads an option's description with it", () => {
		render(<Controlled />);

		expect(screen.getByText("12")).toBeVisible();
		expect(
			screen.getByRole("radio", { name: "Oldest first" }),
		).toHaveAccessibleDescription("Starts from the first day");
	});
});

describe("keyboard", () => {
	test("Tab enters the group once and the arrow keys choose the next option", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		expect(screen.getByRole("radio", { name: "Newest first" })).toHaveFocus();

		await user.keyboard("{ArrowDown}");

		expect(screen.getByRole("radio", { name: "Oldest first" })).toHaveFocus();
		expect(onChange).toHaveBeenCalledWith("oldest");
	});
});

describe("hint and error", () => {
	test("reads the hint with the group", () => {
		render(<Controlled hint="How the list is ordered." />);

		expect(
			screen.getByRole("radiogroup", { name: "Sort" }),
		).toHaveAccessibleDescription("How the list is ordered.");
	});

	test("reads the error with the group and marks it invalid", () => {
		render(<Controlled error="Pick one." />);

		const group = screen.getByRole("radiogroup", { name: "Sort" });
		expect(group).toHaveAccessibleDescription("Pick one.");
		expect(group).toHaveAttribute("aria-invalid", "true");
	});
});

describe("disabled", () => {
	test("a disabled option cannot be chosen", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				onChange={onChange}
				options={[
					...options.slice(0, 2),
					{ value: "largest", label: "Largest amount", isDisabled: true },
				]}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: "Largest amount" }));

		expect(screen.getByRole("radio", { name: "Largest amount" })).toBeDisabled();
		expect(onChange).not.toHaveBeenCalled();
	});

	test("a disabled group cannot be changed", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				isDisabled
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: "Oldest first" }));

		expect(onChange).not.toHaveBeenCalled();
	});
});
