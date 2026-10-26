import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Choice } from "@/components/forms/Choice";

const TYPES = ["checkbox", "switch"] as const;

/** The drawn box or track: the second child of the label, after the hidden input. */
function indicatorOf(
	type: (typeof TYPES)[number] | "checkbox" | "switch",
	name: string | RegExp = "Food",
) {
	return control(type, name).closest("label")!.children[1] as HTMLElement;
}

/** The control's accessible element: a checkbox or a switch. */
function control(type: (typeof TYPES)[number], name: string | RegExp = "Food") {
	return screen.getByRole(type, { name });
}

describe.each(TYPES)("a %s", (type) => {
	describe("structure", () => {
		test("is named by its label and starts off", () => {
			render(
				<Choice
					type={type}
					label="Food"
				/>,
			);

			expect(control(type)).not.toBeChecked();
		});

		test("starts on with defaultSelected", () => {
			render(
				<Choice
					type={type}
					label="Food"
					defaultSelected
				/>,
			);

			expect(control(type)).toBeChecked();
		});

		test("is on or off as the parent says, when controlled", () => {
			const { rerender } = render(
				<Choice
					type={type}
					label="Food"
					isSelected
				/>,
			);
			expect(control(type)).toBeChecked();

			rerender(
				<Choice
					type={type}
					label="Food"
					isSelected={false}
				/>,
			);
			expect(control(type)).not.toBeChecked();
		});

		test("puts the caller's classes on the root element", () => {
			const { container } = render(
				<Choice
					type={type}
					label="Food"
					className="col-span-2"
				/>,
			);

			expect(container.firstElementChild).toHaveClass(
				"col-span-2",
				"flex",
				"flex-col",
			);
		});

		test("is 32px tall and 44px on phones", () => {
			render(
				<Choice
					type={type}
					label="Food"
				/>,
			);

			expect(control(type).closest("label")).toHaveClass(
				"min-h-8",
				"max-md:min-h-11",
			);
		});

		test("can take focus on render", () => {
			render(
				<Choice
					type={type}
					label="Food"
					autoFocus
				/>,
			);

			expect(control(type)).toHaveFocus();
		});
	});

	describe("toggling", () => {
		test("turns on and off with a click, reporting each new state", async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<Choice
					type={type}
					label="Food"
					onChange={onChange}
				/>,
			);

			await user.click(control(type));
			expect(onChange).toHaveBeenLastCalledWith(true);
			expect(control(type)).toBeChecked();

			await user.click(control(type));
			expect(onChange).toHaveBeenLastCalledWith(false);
			expect(control(type)).not.toBeChecked();
			expect(onChange).toHaveBeenCalledTimes(2);
		});

		test("turns on when its label text is pressed", async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<Choice
					type={type}
					label="Food"
					onChange={onChange}
				/>,
			);

			await user.click(screen.getByText("Food"));

			expect(onChange).toHaveBeenCalledWith(true);
		});

		test("turns on when its count is pressed", async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<Choice
					type={type}
					label="Food"
					count={7}
					onChange={onChange}
				/>,
			);

			await user.click(screen.getByText("7"));

			expect(onChange).toHaveBeenCalledWith(true);
		});

		test("turns on with Space once it has focus, and not with Enter", async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<Choice
					type={type}
					label="Food"
					onChange={onChange}
				/>,
			);

			await user.tab();
			expect(control(type)).toHaveFocus();
			await user.keyboard("{Enter}");
			expect(onChange).not.toHaveBeenCalled();

			await user.keyboard(" ");
			expect(onChange).toHaveBeenLastCalledWith(true);
		});

		test("stays as it was when a controlled parent does not update it", async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<Choice
					type={type}
					label="Food"
					isSelected={false}
					onChange={onChange}
				/>,
			);

			await user.click(control(type));

			expect(onChange).toHaveBeenCalledWith(true);
			expect(control(type)).not.toBeChecked();
		});

		test("follows a parent that does update it", async () => {
			const user = userEvent.setup();
			function Controlled() {
				const [on, setOn] = useState(false);
				return (
					<Choice
						type={type}
						label="Food"
						isSelected={on}
						onChange={setOn}
					/>
				);
			}
			render(<Controlled />);

			await user.click(control(type));

			expect(control(type)).toBeChecked();
		});

		test("two of them do not affect each other", async () => {
			const user = userEvent.setup();
			render(
				<>
					<Choice
						type={type}
						label="Food"
					/>
					<Choice
						type={type}
						label="Rent"
					/>
				</>,
			);

			await user.click(control(type, "Food"));

			expect(control(type, "Food")).toBeChecked();
			expect(control(type, "Rent")).not.toBeChecked();
		});
	});

	describe("count", () => {
		test("is shown at the end of the row and is part of the name", () => {
			render(
				<Choice
					type={type}
					label="Food"
					count={7}
				/>,
			);

			expect(control(type, /Food/)).toHaveAccessibleName("Food 7");
			expect(screen.getByText("7")).toHaveClass("figures");
		});

		test("shows a count of zero, so an empty option is visible before picking", () => {
			render(
				<Choice
					type={type}
					label="Food"
					count={0}
				/>,
			);

			expect(screen.getByText("0")).toBeVisible();
		});

		test("shows no count unless given", () => {
			render(
				<Choice
					type={type}
					label="Food"
				/>,
			);

			expect(control(type)).toHaveAccessibleName("Food");
		});
	});

	describe("description", () => {
		test("is read with the control and indented under the label", () => {
			render(
				<Choice
					type={type}
					label="Food"
					description="Groceries and eating out"
				/>,
			);

			expect(control(type)).toHaveAccessibleDescription(
				"Groceries and eating out",
			);
			expect(screen.getByText("Groceries and eating out")).toHaveClass(
				type === "switch" ? "ms-11.5" : "ms-7",
			);
		});

		test("is absent unless given", () => {
			render(
				<Choice
					type={type}
					label="Food"
				/>,
			);

			expect(control(type)).not.toHaveAccessibleDescription();
		});

		test("stays readable when the control is disabled", () => {
			render(
				<Choice
					type={type}
					label="Food"
					description="Groceries"
					isDisabled
				/>,
			);

			expect(control(type)).toHaveAccessibleDescription("Groceries");
		});
	});

	describe("read only and required", () => {
		test("a read-only control keeps its state, and can still be focused", async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<Choice
					type={type}
					label="Food"
					isReadOnly
					defaultSelected
					onChange={onChange}
				/>,
			);

			await user.click(control(type));
			expect(control(type)).toBeChecked();

			control(type).blur();
			await user.tab();
			expect(control(type)).toHaveFocus();
			await user.keyboard(" ");

			expect(control(type)).toBeChecked();
			expect(onChange).not.toHaveBeenCalled();
		});

		test("a required control is marked required", () => {
			render(
				<Choice
					type={type}
					label="Food"
					isRequired
				/>,
			);

			expect(control(type)).toBeRequired();
		});
	});

	describe("forms", () => {
		test("submits its value under its name when on, and nothing when off", async () => {
			const user = userEvent.setup();
			render(
				<form data-testid="form">
					<Choice
						type={type}
						label="Food"
						name="category"
						value="food"
					/>
				</form>,
			);
			const form = screen.getByTestId("form") as HTMLFormElement;
			expect(new FormData(form).get("category")).toBeNull();

			await user.click(control(type));

			expect(new FormData(form).get("category")).toBe("food");
		});
	});

	describe("disabled", () => {
		test("cannot be toggled or focused, and keeps its state", async () => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(
				<Choice
					type={type}
					label="Food"
					isDisabled
					defaultSelected
					onChange={onChange}
				/>,
			);

			await user.click(control(type));
			await user.tab();
			await user.keyboard(" ");

			expect(control(type)).toBeDisabled();
			expect(control(type)).toBeChecked();
			expect(control(type)).not.toHaveFocus();
			expect(onChange).not.toHaveBeenCalled();
		});

		test("shows a dashed edge and grey text, so it is not colour alone", () => {
			render(
				<Choice
					type={type}
					label="Food"
					isDisabled
				/>,
			);

			const row = control(type).closest("label")!;
			expect(row).toHaveClass(
				"disabled:text-ink-3",
				"disabled:cursor-not-allowed",
			);
			expect(row.children[1]).toHaveClass("border-dashed");
		});
	});

	describe("look", () => {
		test("has the edge colour off and the accent on", async () => {
			const user = userEvent.setup();
			render(
				<Choice
					type={type}
					label="Food"
				/>,
			);
			const indicator = indicatorOf(type);
			expect(indicator).toHaveClass("border-edge", "bg-page");

			await user.click(control(type));

			expect(indicator).toHaveClass("border-accent", "bg-accent");
		});

		test("shows the focus ring on the control for keyboard focus only", async () => {
			const user = userEvent.setup();
			render(
				<Choice
					type={type}
					label="Food"
				/>,
			);
			const indicator = indicatorOf(type);

			await user.click(control(type));
			expect(indicator).not.toHaveClass("focus-ring");

			control(type).blur();
			await user.tab();
			expect(indicator).toHaveClass("focus-ring");
		});
	});
});

describe("a checkbox", () => {
	test("is a checkbox, not a switch", () => {
		render(<Choice label="Food" />);

		expect(screen.getByRole("checkbox", { name: "Food" })).toBeInTheDocument();
		expect(screen.queryByRole("switch")).not.toBeInTheDocument();
	});

	test("shows a check mark only while it is on", async () => {
		const user = userEvent.setup();
		render(<Choice label="Food" />);
		const indicator = indicatorOf("checkbox");
		expect(indicator.querySelector("svg")).toBeNull();

		await user.click(control("checkbox"));

		expect(indicator.querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	test("is a rounded square", () => {
		render(<Choice label="Food" />);

		expect(indicatorOf("checkbox")).toHaveClass("rounded-kbd");
	});
});

describe("a switch", () => {
	test("is a switch, not a checkbox", () => {
		render(
			<Choice
				type="switch"
				label="Show Insights"
			/>,
		);

		expect(
			screen.getByRole("switch", { name: "Show Insights" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
	});

	test("slides its handle to the right while on, and has no check mark", async () => {
		const user = userEvent.setup();
		render(
			<Choice
				type="switch"
				label="Show Insights"
			/>,
		);
		const handle = () =>
			indicatorOf("switch", "Show Insights").firstElementChild!;
		expect(handle()).not.toHaveClass("translate-x-3.5");
		expect(handle()).toHaveClass("bg-edge");

		await user.click(control("switch", "Show Insights"));

		expect(handle()).toHaveClass("translate-x-3.5", "bg-on-accent");
		expect(
			indicatorOf("switch", "Show Insights").querySelector("svg"),
		).toBeNull();
	});

	test("is a pill track", () => {
		render(
			<Choice
				type="switch"
				label="Show Insights"
			/>,
		);

		expect(indicatorOf("switch", "Show Insights")).toHaveClass(
			"rounded-full",
			"w-9",
		);
	});
});
