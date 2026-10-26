import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Select, type SelectProps } from "@/components/forms/Select";

const units = [
	{ value: "week", label: "weeks" },
	{ value: "month", label: "months" },
	{ value: "year", label: "years" },
];

function Controlled({
	onChange,
	...props
}: Partial<Omit<SelectProps, "value" | "onChange">> & {
	onChange?: (value: string | number) => void;
}) {
	const [value, setValue] = useState<string | number>("week");
	return (
		<Select
			label="Unit"
			options={units}
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
	test("is named by its label and shows the chosen option", () => {
		render(<Controlled />);

		const trigger = screen.getByRole("button", { name: /Unit/ });
		expect(trigger).toHaveTextContent("weeks");
		expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
	});

	test("opens with a click and lists every option", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(screen.getByRole("button", { name: /Unit/ }));

		expect(screen.getByRole("listbox")).toBeVisible();
		expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
			"weeks",
			"months",
			"years",
		]);
		expect(screen.getByRole("option", { name: "weeks" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	test("picks an option with the mouse, closes, and returns focus to the trigger", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByRole("button", { name: /Unit/ }));
		await user.click(screen.getByRole("option", { name: "months" }));

		expect(onChange).toHaveBeenCalledWith("month");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Unit/ })).toHaveTextContent(
			"months",
		);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /Unit/ })).toHaveFocus(),
		);
	});

	test("takes plain numbers and passes a number back", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Select
				label="Year"
				size="sm"
				options={[2024, 2025, 2026]}
				value={2025}
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Year/ }));
		await user.click(screen.getByRole("option", { name: "2026" }));

		expect(onChange).toHaveBeenCalledWith(2026);
	});
});

describe("keyboard", () => {
	test("opens with Enter, moves with the arrow keys, selects with Enter", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		expect(screen.getByRole("button", { name: /Unit/ })).toHaveFocus();
		await user.keyboard("{Enter}");
		expect(screen.getByRole("listbox")).toBeVisible();

		await user.keyboard("{ArrowDown}{Enter}");

		expect(onChange).toHaveBeenCalledWith("month");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	test("closes on Escape without changing the choice", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		await user.keyboard("{Enter}{ArrowDown}{Escape}");

		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /Unit/ })).toHaveFocus(),
		);
	});

	test("jumps to an option by typing its first letter", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		await user.keyboard("{Enter}y{Enter}");

		expect(onChange).toHaveBeenCalledWith("year");
	});
});

describe("hint and error", () => {
	test("reads the hint with the trigger", () => {
		render(<Controlled hint="How often it repeats." />);

		expect(
			screen.getByRole("button", { name: /Unit/ }),
		).toHaveAccessibleDescription("How often it repeats.");
	});

	test("reads the error with the trigger and marks it invalid", () => {
		render(<Controlled error="Pick a unit." />);

		expect(
			screen.getByRole("button", { name: /Unit/ }),
		).toHaveAccessibleDescription("Pick a unit.");
	});
});

describe("disabled", () => {
	test("does not open", async () => {
		const user = userEvent.setup();
		render(<Controlled isDisabled />);

		await user.click(screen.getByRole("button", { name: /Unit/ }));

		expect(screen.getByRole("button", { name: /Unit/ })).toBeDisabled();
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});
});
