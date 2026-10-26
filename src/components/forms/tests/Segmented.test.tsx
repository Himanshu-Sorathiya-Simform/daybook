import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Segmented, type SegmentedProps } from "@/components/forms/Segmented";

/** The visible pill of an option: the label that holds the hidden radio input. */
function segment(name: string) {
	return screen.getByRole("radio", { name }).closest("label") as HTMLElement;
}

function Controlled({
	onChange,
	initial = "Daily",
	...props
}: Partial<Omit<SegmentedProps, "value" | "onChange">> & {
	onChange?: (value: string) => void;
	initial?: string;
}) {
	const [value, setValue] = useState(initial);
	return (
		<Segmented
			label="Strip view"
			options={["Daily", "Pace", "Weekly"]}
			{...props}
			value={value}
			onChange={(next) => {
				setValue(next);
				onChange?.(next);
			}}
		/>
	);
}

describe("structure", () => {
	test("is a radio group named by its label, with one radio per option", () => {
		render(<Controlled />);

		expect(
			screen.getByRole("radiogroup", { name: "Strip view" }),
		).toBeInTheDocument();
		expect(
			screen
				.getAllByRole("radio")
				.map((radio) => radio.closest("label")?.textContent),
		).toEqual(["Daily", "Pace", "Weekly"]);
	});

	test("is horizontal", () => {
		render(<Controlled />);

		expect(screen.getByRole("radiogroup")).toHaveAttribute(
			"aria-orientation",
			"horizontal",
		);
	});

	test("marks only the chosen option as checked", () => {
		render(<Controlled initial="Pace" />);

		expect(screen.getByRole("radio", { name: "Daily" })).not.toBeChecked();
		expect(screen.getByRole("radio", { name: "Pace" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Weekly" })).not.toBeChecked();
	});

	test("has nothing checked when the value matches no option", () => {
		render(<Controlled initial="nothing" />);

		for (const radio of screen.getAllByRole("radio"))
			expect(radio).not.toBeChecked();
	});

	test("uses an option's label for what is shown and its value for what is reported", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Segmented
				label="Type"
				options={[
					{ value: "to_goal", label: "To Goal" },
					{ value: "from_goal", label: "From Goal" },
				]}
				value="to_goal"
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: "From Goal" }));

		expect(onChange).toHaveBeenCalledWith("from_goal");
		expect(screen.getByRole("radio", { name: "To Goal" })).toBeChecked();
	});

	test("can mix plain and labelled options", () => {
		render(
			<Segmented
				label="Mixed"
				options={["Plain", { value: "v", label: "Labelled" }]}
				value="Plain"
				onChange={() => {}}
			/>,
		);

		expect(screen.getByRole("radio", { name: "Plain" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Labelled" })).toBeInTheDocument();
	});

	test("follows a value the parent changes", () => {
		const { rerender } = render(
			<Segmented
				label="View"
				options={["A", "B"]}
				value="A"
				onChange={() => {}}
			/>,
		);

		rerender(
			<Segmented
				label="View"
				options={["A", "B"]}
				value="B"
				onChange={() => {}}
			/>,
		);

		expect(screen.getByRole("radio", { name: "B" })).toBeChecked();
	});

	test("follows a list of options the parent changes", () => {
		const { rerender } = render(
			<Segmented
				label="View"
				options={["A", "B"]}
				value="A"
				onChange={() => {}}
			/>,
		);

		rerender(
			<Segmented
				label="View"
				options={["A", "B", "C"]}
				value="A"
				onChange={() => {}}
			/>,
		);

		expect(screen.getAllByRole("radio")).toHaveLength(3);
	});

	test("takes the caller's classes on the group", () => {
		render(<Controlled className="ml-auto" />);

		expect(screen.getByRole("radiogroup")).toHaveClass("ml-auto", "bg-soft");
	});

	test("submits the chosen value with a form under its name", () => {
		render(
			<form data-testid="form">
				<Controlled
					name="view"
					initial="Pace"
				/>
			</form>,
		);

		expect(
			new FormData(screen.getByTestId("form") as HTMLFormElement).get("view"),
		).toBe("Pace");
	});
});

describe("size", () => {
	test("is 32px tall by default and 26px small, and 44px on phones either way", () => {
		const { rerender } = render(<Controlled />);
		expect(segment("Daily")).toHaveClass("h-8", "text-label", "max-md:min-h-11");

		rerender(<Controlled size="sm" />);
		expect(segment("Daily")).toHaveClass(
			"h-6.5",
			"text-caption",
			"max-md:min-h-11",
		);
	});
});

describe("choosing with the mouse", () => {
	test("selects an option on click and reports its value once", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByRole("radio", { name: "Pace" }));

		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenCalledWith("Pace");
		expect(screen.getByRole("radio", { name: "Pace" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Daily" })).not.toBeChecked();
	});

	test("selects an option when its text is pressed", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByText("Weekly"));

		expect(onChange).toHaveBeenCalledWith("Weekly");
	});

	test("never ends up with nothing selected: pressing the chosen option changes nothing", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByRole("radio", { name: "Daily" }));

		expect(screen.getByRole("radio", { name: "Daily" })).toBeChecked();
		expect(onChange).not.toHaveBeenCalled();
	});

	test("keeps the old choice when the parent does not update the value", async () => {
		const user = userEvent.setup();
		render(
			<Segmented
				label="View"
				options={["A", "B"]}
				value="A"
				onChange={() => {}}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: "B" }));

		expect(screen.getByRole("radio", { name: "A" })).toBeChecked();
	});

	test("moves from one option to another many times", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByRole("radio", { name: "Pace" }));
		await user.click(screen.getByRole("radio", { name: "Weekly" }));
		await user.click(screen.getByRole("radio", { name: "Daily" }));

		expect(onChange.mock.calls.map(([value]) => value)).toEqual([
			"Pace",
			"Weekly",
			"Daily",
		]);
	});

	test("shows the selected look on the chosen option only", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(screen.getByRole("radio", { name: "Pace" }));

		expect(segment("Pace")).toHaveAttribute("data-selected", "true");
		expect(segment("Pace")).toHaveClass(
			"selected:bg-page",
			"selected:border-line",
		);
		expect(segment("Daily")).not.toHaveAttribute("data-selected");
	});
});

describe("keyboard", () => {
	test("Tab enters the group once, on the chosen option", async () => {
		const user = userEvent.setup();
		render(
			<>
				<button>Before</button>
				<Controlled initial="Pace" />
				<button>After</button>
			</>,
		);

		await user.tab();
		await user.tab();
		expect(screen.getByRole("radio", { name: "Pace" })).toHaveFocus();

		await user.tab();
		expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
	});

	test("Shift+Tab leaves the group in one step as well", async () => {
		const user = userEvent.setup();
		render(
			<>
				<button>Before</button>
				<Controlled initial="Pace" />
			</>,
		);
		await user.tab();
		await user.tab();

		await user.tab({ shift: true });

		expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
	});

	test("ArrowRight and ArrowLeft move focus and choose", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		await user.keyboard("{ArrowRight}");
		expect(screen.getByRole("radio", { name: "Pace" })).toHaveFocus();
		expect(onChange).toHaveBeenLastCalledWith("Pace");

		await user.keyboard("{ArrowLeft}");
		expect(screen.getByRole("radio", { name: "Daily" })).toHaveFocus();
		expect(onChange).toHaveBeenLastCalledWith("Daily");
	});

	test("ArrowDown and ArrowUp move the same way", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.tab();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("radio", { name: "Pace" })).toHaveFocus();
		await user.keyboard("{ArrowUp}");

		expect(screen.getByRole("radio", { name: "Daily" })).toHaveFocus();
	});

	test("wraps from the last option to the first, and back", async () => {
		const user = userEvent.setup();
		render(<Controlled initial="Weekly" />);

		await user.tab();
		await user.keyboard("{ArrowRight}");
		expect(screen.getByRole("radio", { name: "Daily" })).toHaveFocus();

		await user.keyboard("{ArrowLeft}");
		expect(screen.getByRole("radio", { name: "Weekly" })).toHaveFocus();
	});

	test("Space chooses the focused option", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		await user.keyboard("{ArrowRight}");
		await user.keyboard(" ");

		expect(screen.getByRole("radio", { name: "Pace" })).toBeChecked();
	});

	test("shows the focus ring only for keyboard focus", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.tab();

		expect(segment("Daily")).toHaveAttribute("data-focus-visible", "true");
		expect(segment("Daily")).toHaveClass("focus-visible:focus-ring");
	});

	test("shows no keyboard focus ring after a mouse click", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(screen.getByRole("radio", { name: "Pace" }));

		expect(segment("Pace")).not.toHaveAttribute("data-focus-visible");
	});
});

describe("two groups", () => {
	test("do not affect each other", async () => {
		const user = userEvent.setup();
		render(
			<>
				<Controlled label="First" />
				<Controlled label="Second" />
			</>,
		);
		const second = screen.getByRole("radiogroup", { name: "Second" });
		const paceInSecond = screen
			.getAllByRole("radio", { name: "Pace" })
			.find((radio) => second.contains(radio))!;

		await user.click(paceInSecond);

		expect(
			screen
				.getAllByRole("radio", { name: "Pace" })
				.map((radio) => (radio as HTMLInputElement).checked),
		).toEqual([false, true]);
	});
});

describe("disabled", () => {
	test("cannot be changed or focused", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				isDisabled
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: "Pace" }));
		await user.tab();

		expect(screen.getByRole("radio", { name: "Pace" })).toBeDisabled();
		expect(screen.getByRole("radio", { name: "Daily" })).not.toHaveFocus();
		expect(onChange).not.toHaveBeenCalled();
	});

	test("keeps showing the chosen option, in grey", () => {
		render(
			<Controlled
				isDisabled
				initial="Pace"
			/>,
		);

		expect(screen.getByRole("radio", { name: "Pace" })).toBeChecked();
		expect(segment("Pace")).toHaveClass("disabled:text-ink-3");
	});
});
