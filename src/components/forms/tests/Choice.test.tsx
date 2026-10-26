import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Choice } from "@/components/forms/Choice";

describe("checkbox", () => {
	test("is a checkbox named by its label", () => {
		render(<Choice label="Food" />);

		expect(screen.getByRole("checkbox", { name: "Food" })).not.toBeChecked();
	});

	test("toggles with a click and reports the new state", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Choice
				label="Food"
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("checkbox", { name: "Food" }));
		expect(onChange).toHaveBeenLastCalledWith(true);
		expect(screen.getByRole("checkbox", { name: "Food" })).toBeChecked();

		await user.click(screen.getByRole("checkbox", { name: "Food" }));
		expect(onChange).toHaveBeenLastCalledWith(false);
	});

	test("toggles with Space once it has focus", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Choice
				label="Food"
				onChange={onChange}
			/>,
		);

		await user.tab();
		expect(screen.getByRole("checkbox", { name: "Food" })).toHaveFocus();
		await user.keyboard(" ");

		expect(onChange).toHaveBeenLastCalledWith(true);
	});

	test("can be controlled", () => {
		render(
			<Choice
				label="Food"
				isSelected
			/>,
		);

		expect(screen.getByRole("checkbox", { name: "Food" })).toBeChecked();
	});

	test("shows the count and reads the description with the checkbox", () => {
		render(
			<Choice
				label="Food"
				count={7}
				description="Groceries and eating out"
			/>,
		);

		expect(screen.getByText("7")).toBeVisible();
		expect(
			screen.getByRole("checkbox", { name: /Food/ }),
		).toHaveAccessibleDescription("Groceries and eating out");
	});

	test("puts the caller's classes on the root element", () => {
		const { container } = render(
			<Choice
				label="Food"
				className="col-span-2"
			/>,
		);

		expect(container.firstElementChild).toHaveClass("col-span-2");
	});
});

describe("switch", () => {
	test("is a switch named by its label", () => {
		render(
			<Choice
				type="switch"
				label="Show Insights"
			/>,
		);

		expect(
			screen.getByRole("switch", { name: "Show Insights" }),
		).not.toBeChecked();
	});

	test("turns on and off with a click", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Choice
				type="switch"
				label="Show Insights"
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("switch", { name: "Show Insights" }));
		expect(onChange).toHaveBeenLastCalledWith(true);

		await user.click(screen.getByRole("switch", { name: "Show Insights" }));
		expect(onChange).toHaveBeenLastCalledWith(false);
	});

	test("turns on with Space once it has focus", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Choice
				type="switch"
				label="Show Insights"
				onChange={onChange}
			/>,
		);

		await user.tab();
		expect(screen.getByRole("switch", { name: "Show Insights" })).toHaveFocus();
		await user.keyboard(" ");

		expect(onChange).toHaveBeenLastCalledWith(true);
	});

	test("reads the description with the switch", () => {
		render(
			<Choice
				type="switch"
				label="Show Insights"
				description="Simulated tips for this month"
			/>,
		);

		expect(
			screen.getByRole("switch", { name: "Show Insights" }),
		).toHaveAccessibleDescription("Simulated tips for this month");
	});
});

describe("disabled", () => {
	test.each(["checkbox", "switch"] as const)(
		"a %s cannot be toggled",
		async (type) => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<Choice
					type={type}
					label="Food"
					isDisabled
					onChange={onChange}
				/>,
			);

			await user.click(screen.getByRole(type, { name: "Food" }));

			expect(screen.getByRole(type, { name: "Food" })).toBeDisabled();
			expect(onChange).not.toHaveBeenCalled();
		},
	);
});
