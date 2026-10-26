import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	ChoiceGroup,
	type ChoiceGroupOption,
	type ChoiceGroupProps,
} from "@/components/forms/ChoiceGroup";

const options: ChoiceGroupOption[] = [
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
	initial = "newest",
	...props
}: Partial<Omit<ChoiceGroupProps, "value" | "onChange">> & {
	onChange?: (value: string) => void;
	initial?: string | null;
}) {
	const [value, setValue] = useState<string | null>(initial);
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

const radio = (name: string | RegExp) => screen.getByRole("radio", { name });

describe("structure", () => {
	test("is a radio group named by its label, with one radio per option", () => {
		render(<Controlled />);

		expect(screen.getByRole("radiogroup", { name: "Sort" })).toBeInTheDocument();
		expect(screen.getAllByRole("radio")).toHaveLength(3);
	});

	test("checks only the chosen option", () => {
		render(<Controlled initial="oldest" />);

		expect(radio("Newest first")).not.toBeChecked();
		expect(radio(/Oldest first/)).toBeChecked();
		expect(radio(/Largest amount/)).not.toBeChecked();
	});

	test("checks nothing when the value is null", () => {
		render(<Controlled initial={null} />);

		for (const input of screen.getAllByRole("radio"))
			expect(input).not.toBeChecked();
	});

	test("checks nothing when the value matches no option", () => {
		render(<Controlled initial="sideways" />);

		for (const input of screen.getAllByRole("radio"))
			expect(input).not.toBeChecked();
	});

	test("follows a value the parent changes", () => {
		const { rerender } = render(
			<ChoiceGroup
				label="Sort"
				options={options}
				value="newest"
				onChange={() => {}}
			/>,
		);

		rerender(
			<ChoiceGroup
				label="Sort"
				options={options}
				value="largest"
				onChange={() => {}}
			/>,
		);

		expect(radio(/Largest amount/)).toBeChecked();
	});

	test("puts the caller's classes on the root, which holds the label and the options", () => {
		const { container } = render(<Controlled className="w-64" />);

		expect(container.firstElementChild).toHaveClass("w-64");
		expect(container.firstElementChild).toContainElement(
			screen.getByText("Sort"),
		);
		expect(container.firstElementChild).toContainElement(radio("Newest first"));
	});

	test("shows the optional mark and the counter beside the label", () => {
		render(
			<Controlled
				optional
				counter="1 of 3"
			/>,
		);

		expect(screen.getByText("(optional)")).toBeVisible();
		expect(screen.getByText("1 of 3")).toBeVisible();
	});

	test("is 32px per option and 44px on phones", () => {
		render(<Controlled />);

		expect(radio("Newest first").closest("label")).toHaveClass(
			"min-h-8",
			"max-md:min-h-11",
		);
	});
});

describe("orientation", () => {
	test("stacks the options by default", () => {
		render(<Controlled />);

		expect(screen.getByRole("radiogroup")).toHaveAttribute(
			"aria-orientation",
			"vertical",
		);
		expect(
			radio("Newest first").closest("[class*='flex-col']"),
		).toBeInTheDocument();
		expect(
			radio("Newest first").closest("label")!.parentElement!.parentElement,
		).toHaveClass("flex-col", "gap-1");
	});

	test("lays the options in a row when horizontal", () => {
		render(<Controlled orientation="horizontal" />);

		expect(screen.getByRole("radiogroup")).toHaveAttribute(
			"aria-orientation",
			"horizontal",
		);
		expect(
			radio("Newest first").closest("label")!.parentElement!.parentElement,
		).toHaveClass("flex-row", "gap-4");
	});
});

describe("choosing with the mouse", () => {
	test("chooses an option on click and reports its value once", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(radio(/Oldest first/));

		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenCalledWith("oldest");
		expect(radio(/Oldest first/)).toBeChecked();
		expect(radio("Newest first")).not.toBeChecked();
	});

	test("chooses an option when its text is pressed", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByText("Largest amount"));

		expect(onChange).toHaveBeenCalledWith("largest");
	});

	test("does not report a change when the chosen option is pressed again", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(radio("Newest first"));

		expect(onChange).not.toHaveBeenCalled();
		expect(radio("Newest first")).toBeChecked();
	});

	test("chooses from nothing", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				initial={null}
				onChange={onChange}
			/>,
		);

		await user.click(radio("Newest first"));

		expect(onChange).toHaveBeenCalledWith("newest");
	});

	test("keeps the old choice when the parent does not update the value", async () => {
		const user = userEvent.setup();
		render(
			<ChoiceGroup
				label="Sort"
				options={options}
				value="newest"
				onChange={() => {}}
			/>,
		);

		await user.click(radio(/Oldest first/));

		expect(radio("Newest first")).toBeChecked();
	});

	test("shows the dot and the accent edge on the chosen option only", () => {
		render(<Controlled />);

		const chosen = radio("Newest first").closest("label")!.children[1]!;
		const other = radio(/Oldest first/).closest("label")!.children[1]!;
		expect(chosen).toHaveClass("border-accent");
		expect(chosen.firstElementChild).toHaveClass("bg-accent", "rounded-full");
		expect(other).toHaveClass("border-edge");
		expect(other.firstElementChild).toBeNull();
	});
});

describe("keyboard", () => {
	test("Tab lands on the chosen option, then leaves the group", async () => {
		const user = userEvent.setup();
		render(
			<>
				<button>Before</button>
				<Controlled initial="oldest" />
				<button>After</button>
			</>,
		);

		await user.tab();
		await user.tab();
		expect(radio(/Oldest first/)).toHaveFocus();

		await user.tab();
		expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
	});

	test("Tab lands on the first option when nothing is chosen", async () => {
		const user = userEvent.setup();
		render(<Controlled initial={null} />);

		await user.tab();

		expect(radio("Newest first")).toHaveFocus();
	});

	test("Shift+Tab leaves the group in one step", async () => {
		const user = userEvent.setup();
		render(
			<>
				<button>Before</button>
				<Controlled initial="oldest" />
			</>,
		);
		await user.tab();
		await user.tab();

		await user.tab({ shift: true });

		expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
	});

	test.each([
		["{ArrowDown}", "{ArrowUp}"],
		["{ArrowRight}", "{ArrowLeft}"],
	])(
		"%s moves to the next option and chooses it, %s moves back",
		async (next, previous) => {
			const user = userEvent.setup();
			const onChange = vi.fn();
			render(<Controlled onChange={onChange} />);

			await user.tab();
			await user.keyboard(next);
			expect(radio(/Oldest first/)).toHaveFocus();
			expect(onChange).toHaveBeenLastCalledWith("oldest");

			await user.keyboard(previous);
			expect(radio("Newest first")).toHaveFocus();
			expect(onChange).toHaveBeenLastCalledWith("newest");
		},
	);

	test("wraps from the last option to the first, and back", async () => {
		const user = userEvent.setup();
		render(<Controlled initial="largest" />);

		await user.tab();
		await user.keyboard("{ArrowDown}");
		expect(radio("Newest first")).toHaveFocus();

		await user.keyboard("{ArrowUp}");
		expect(radio(/Largest amount/)).toHaveFocus();
	});

	test("Space chooses the focused option", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				initial={null}
				onChange={onChange}
			/>,
		);

		await user.tab();
		await user.keyboard(" ");

		expect(onChange).toHaveBeenCalledWith("newest");
	});

	test("skips a disabled option with the arrow keys", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				onChange={onChange}
				options={[
					options[0]!,
					{ ...options[1]!, isDisabled: true },
					options[2]!,
				]}
			/>,
		);

		await user.tab();
		await user.keyboard("{ArrowDown}");

		expect(radio(/Largest amount/)).toHaveFocus();
		expect(onChange).toHaveBeenLastCalledWith("largest");
	});

	test("shows the focus ring on the focused option for keyboard focus only", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(radio(/Oldest first/));
		expect(radio(/Oldest first/).closest("label")!.children[1]).not.toHaveClass(
			"focus-ring",
		);

		radio(/Oldest first/).blur();
		await user.tab();
		expect(radio(/Oldest first/).closest("label")!.children[1]).toHaveClass(
			"focus-ring",
		);
	});
});

describe("count and description", () => {
	test("shows a count at the end of the row and counts it in the name", () => {
		render(<Controlled />);

		expect(radio(/Largest amount/)).toHaveAccessibleName("Largest amount 12");
		expect(screen.getByText("12")).toHaveClass("figures");
	});

	test("shows a count of zero", () => {
		render(
			<Controlled options={[{ value: "a", label: "Empty one", count: 0 }]} />,
		);

		expect(screen.getByText("0")).toBeVisible();
	});

	test("reads an option's description with that option only", () => {
		render(<Controlled />);

		expect(radio(/Oldest first/)).toHaveAccessibleDescription(
			"Starts from the first day",
		);
		expect(radio("Newest first")).not.toHaveAccessibleDescription(
			"Starts from the first day",
		);
	});

	test("indents a description under its label", () => {
		render(<Controlled />);

		expect(screen.getByText("Starts from the first day")).toHaveClass("ms-7");
	});
});

describe("hint and error", () => {
	test("reads the hint with the group", () => {
		render(<Controlled hint="How the list is ordered." />);

		expect(
			screen.getByRole("radiogroup", { name: "Sort" }),
		).toHaveAccessibleDescription("How the list is ordered.");
	});

	test("is valid by default", () => {
		render(<Controlled />);

		expect(screen.getByRole("radiogroup")).not.toHaveAttribute("aria-invalid");
	});

	test("reads the error instead of the hint and marks the group invalid", () => {
		render(
			<Controlled
				hint="How the list is ordered."
				error="Pick one."
			/>,
		);

		const group = screen.getByRole("radiogroup", { name: "Sort" });
		expect(group).toHaveAccessibleDescription("Pick one.");
		expect(group).toHaveAttribute("aria-invalid", "true");
		expect(
			screen.queryByText("How the list is ordered."),
		).not.toBeInTheDocument();
	});

	test("still lets the user choose while it shows an error", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				error="Pick one."
				onChange={onChange}
			/>,
		);

		await user.click(radio(/Oldest first/));

		expect(onChange).toHaveBeenCalledWith("oldest");
	});
});

describe("forms", () => {
	test("submits the chosen value under its name", () => {
		render(
			<form data-testid="form">
				<Controlled
					name="sort"
					initial="oldest"
				/>
			</form>,
		);

		expect(
			new FormData(screen.getByTestId("form") as HTMLFormElement).get("sort"),
		).toBe("oldest");
	});

	test("submits nothing while nothing is chosen", () => {
		render(
			<form data-testid="form">
				<Controlled
					name="sort"
					initial={null}
				/>
			</form>,
		);

		expect(
			new FormData(screen.getByTestId("form") as HTMLFormElement).get("sort"),
		).toBeNull();
	});

	test("is marked required", () => {
		render(<Controlled isRequired />);

		expect(screen.getByRole("radiogroup")).toHaveAttribute(
			"aria-required",
			"true",
		);
	});
});

describe("read only", () => {
	test("keeps its choice and can still be focused", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				isReadOnly
				onChange={onChange}
			/>,
		);

		await user.click(radio(/Oldest first/));
		await user.tab();

		expect(radio("Newest first")).toBeChecked();
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("disabled", () => {
	test("a disabled group cannot be changed or focused", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				isDisabled
				onChange={onChange}
			/>,
		);

		await user.click(radio(/Oldest first/));
		await user.tab();

		expect(radio(/Oldest first/)).toBeDisabled();
		expect(radio("Newest first")).not.toHaveFocus();
		expect(onChange).not.toHaveBeenCalled();
	});

	test("a disabled option cannot be chosen, and shows a dashed edge", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				onChange={onChange}
				options={[options[0]!, { ...options[1]!, isDisabled: true }]}
			/>,
		);

		await user.click(radio(/Oldest first/));

		expect(radio(/Oldest first/)).toBeDisabled();
		expect(radio("Newest first")).not.toBeDisabled();
		expect(radio(/Oldest first/).closest("label")!.children[1]).toHaveClass(
			"border-dashed",
		);
		expect(onChange).not.toHaveBeenCalled();
	});

	test("a disabled option's description stays readable", () => {
		render(<Controlled options={[{ ...options[1]!, isDisabled: true }]} />);

		expect(radio(/Oldest first/)).toHaveAccessibleDescription(
			"Starts from the first day",
		);
	});
});

describe("options", () => {
	test("follows a list of options the parent changes", () => {
		const { rerender } = render(
			<ChoiceGroup
				label="Sort"
				options={options}
				value="newest"
				onChange={() => {}}
			/>,
		);

		rerender(
			<ChoiceGroup
				label="Sort"
				options={options.slice(0, 2)}
				value="newest"
				onChange={() => {}}
			/>,
		);

		expect(screen.getAllByRole("radio")).toHaveLength(2);
	});

	test("works with a single option", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<ChoiceGroup
				label="Only"
				options={[{ value: "a", label: "A" }]}
				value={null}
				onChange={onChange}
			/>,
		);

		await user.click(radio("A"));

		expect(onChange).toHaveBeenCalledWith("a");
	});
});
