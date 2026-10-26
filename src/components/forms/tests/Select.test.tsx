import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
	initial = "week",
	...props
}: Partial<Omit<SelectProps, "value" | "onChange">> & {
	onChange?: (value: string | number) => void;
	initial?: string | number;
}) {
	const [value, setValue] = useState<string | number>(initial);
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

// While the list is open React Aria hides the rest of the page from screen readers, so the
// trigger has to be found even when it is hidden.
const trigger = () => screen.getByRole("button", { name: /Unit/, hidden: true });

describe("trigger", () => {
	test("is named by its label, shows the chosen option and says it opens a list", () => {
		render(<Controlled />);

		expect(trigger()).toHaveTextContent("weeks");
		expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
		expect(trigger()).toHaveAttribute("aria-expanded", "false");
	});

	test("pressing the label focuses the trigger", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(screen.getByText("Unit"));

		expect(trigger()).toHaveFocus();
	});

	test("shows the placeholder when the value matches no option", () => {
		render(
			<Controlled
				initial="decade"
				placeholder="Choose a unit"
			/>,
		);

		expect(trigger()).toHaveTextContent("Choose a unit");
	});

	test("shows React Aria's own placeholder when none is given", () => {
		render(<Controlled initial="decade" />);

		expect(trigger()).toHaveTextContent("Select an item");
	});

	test("shows the label of the current value when the parent changes it", () => {
		const { rerender } = render(
			<Select
				label="Unit"
				options={units}
				value="week"
				onChange={() => {}}
			/>,
		);

		rerender(
			<Select
				label="Unit"
				options={units}
				value="year"
				onChange={() => {}}
			/>,
		);

		expect(trigger()).toHaveTextContent("years");
	});

	test("can take focus on render", () => {
		render(<Controlled autoFocus />);

		expect(trigger()).toHaveFocus();
	});

	test("is 44px for forms and 36px small, and 44px on phones either way", () => {
		const { rerender } = render(<Controlled />);
		expect(trigger()).toHaveClass("h-11", "max-md:min-h-11");

		rerender(<Controlled size="sm" />);
		expect(trigger()).toHaveClass("h-9", "text-caption", "max-md:min-h-11");
	});

	test("takes the caller's classes on the root, which holds the label and the trigger", () => {
		const { container } = render(<Controlled className="w-52" />);

		const root = container.querySelector(".w-52");
		expect(root).toBeInTheDocument();
		expect(root).toContainElement(trigger());
		expect(root).toContainElement(screen.getByText("Unit"));
	});
});

describe("opening", () => {
	test("opens with a click and lists every option in order, marking the chosen one", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(trigger());

		expect(screen.getByRole("listbox")).toBeVisible();
		expect(trigger()).toHaveAttribute("aria-expanded", "true");
		const options = screen.getAllByRole("option");
		expect(options.map((option) => option.textContent)).toEqual([
			"weeks",
			"months",
			"years",
		]);
		expect(
			options.map((option) => option.getAttribute("aria-selected")),
		).toEqual(["true", "false", "false"]);
	});

	test("shows a check mark on the chosen option only", async () => {
		const user = userEvent.setup();
		render(<Controlled initial="month" />);

		await user.click(trigger());

		const options = screen.getAllByRole("option");
		expect(options[0]?.querySelector("svg")).toBeNull();
		expect(options[1]?.querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
		expect(options[2]?.querySelector("svg")).toBeNull();
	});

	test("names the list by the label", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(trigger());

		expect(screen.getByRole("listbox", { name: /Unit/ })).toBeVisible();
	});

	test("is closed again by a second click on the trigger", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(trigger());
		await user.click(trigger());

		await waitFor(() =>
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
		);
	});

	test("closes when the user presses outside, without changing the choice", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);
		await user.click(trigger());

		await user.click(document.body);

		await waitFor(() =>
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
		);
		expect(onChange).not.toHaveBeenCalled();
		expect(trigger()).toHaveTextContent("weeks");
	});

	test("reports being opened and closed", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Controlled onOpenChange={onOpenChange} />);

		await user.click(trigger());
		await user.keyboard("{Escape}");

		expect(onOpenChange.mock.calls.map(([open]) => open)).toEqual([true, false]);
	});

	test("can start open", () => {
		render(<Controlled defaultOpen />);

		expect(screen.getByRole("listbox")).toBeVisible();
	});

	test("opens with the chosen option focused", async () => {
		const user = userEvent.setup();
		render(<Controlled initial="month" />);

		await user.click(trigger());

		await waitFor(() =>
			expect(screen.getByRole("option", { name: "months" })).toHaveFocus(),
		);
	});

	test("is as wide as its trigger at least", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.click(trigger());

		expect(screen.getByRole("listbox").closest("[data-trigger]")).toHaveClass(
			"min-w-(--trigger-width)",
		);
	});
});

describe("choosing", () => {
	test("picks an option with the mouse, closes, and returns focus to the trigger", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "months" }));

		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenCalledWith("month");
		await waitFor(() =>
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
		);
		expect(trigger()).toHaveTextContent("months");
		await waitFor(() => expect(trigger()).toHaveFocus());
	});

	test("does not report a change when the chosen option is picked again", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "weeks" }));

		expect(onChange).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
		);
	});

	test("can be chosen several times in a row", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "months" }));
		await waitFor(() =>
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
		);
		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "years" }));

		expect(onChange.mock.calls.map(([value]) => value)).toEqual([
			"month",
			"year",
		]);
		expect(trigger()).toHaveTextContent("years");
	});

	test("keeps the old choice when the parent does not update the value", async () => {
		const user = userEvent.setup();
		render(
			<Select
				label="Unit"
				options={units}
				value="week"
				onChange={() => {}}
			/>,
		);

		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "years" }));

		expect(trigger()).toHaveTextContent("weeks");
	});

	test("takes plain numbers and gives a number back", async () => {
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
		expect(typeof onChange.mock.calls[0]?.[0]).toBe("number");
	});

	test("takes plain strings as both value and label", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Select
				label="Country"
				options={["India", "Germany"]}
				value="India"
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Country/ }));
		await user.click(screen.getByRole("option", { name: "Germany" }));

		expect(onChange).toHaveBeenCalledWith("Germany");
	});

	test("keeps a string value and a number value apart", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Select
				label="Mixed"
				options={[
					{ value: "1", label: "string one" },
					{ value: 2, label: "number two" },
				]}
				value="1"
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Mixed/ }));
		await user.click(screen.getByRole("option", { name: "number two" }));

		expect(onChange).toHaveBeenCalledWith(2);
	});

	test("does not let a disabled option be chosen", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				onChange={onChange}
				disabledKeys={["month"]}
			/>,
		);

		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "months" }));

		expect(screen.getByRole("option", { name: "months" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("keyboard", () => {
	test.each(["{Enter}", " ", "{ArrowDown}"])(
		"%j on the trigger opens the list",
		async (key) => {
			const user = userEvent.setup();
			render(<Controlled />);

			await user.tab();
			await user.keyboard(key);

			expect(screen.getByRole("listbox")).toBeVisible();
		},
	);

	test("ArrowUp on the trigger opens the list too", async () => {
		const user = userEvent.setup();
		render(<Controlled />);

		await user.tab();
		await user.keyboard("{ArrowUp}");

		expect(screen.getByRole("listbox")).toBeVisible();
	});

	test("moves with the arrow keys and chooses with Enter", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		await user.keyboard("{Enter}{ArrowDown}{Enter}");

		expect(onChange).toHaveBeenCalledWith("month");
		await waitFor(() =>
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
		);
	});

	test("chooses with Space as well", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		await user.keyboard("{Enter}{ArrowDown}{ArrowDown} ");

		expect(onChange).toHaveBeenCalledWith("year");
	});

	test("goes up with ArrowUp", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				initial="year"
				onChange={onChange}
			/>,
		);

		await user.tab();
		await user.keyboard("{Enter}{ArrowUp}{Enter}");

		expect(onChange).toHaveBeenCalledWith("month");
	});

	test("jumps to the first and last option with Home and End", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				initial="month"
				onChange={onChange}
			/>,
		);

		await user.tab();
		await user.keyboard("{Enter}{End}");
		await waitFor(() =>
			expect(screen.getByRole("option", { name: "years" })).toHaveFocus(),
		);
		await user.keyboard("{Home}");
		await waitFor(() =>
			expect(screen.getByRole("option", { name: "weeks" })).toHaveFocus(),
		);
		await user.keyboard("{Enter}");

		expect(onChange).toHaveBeenCalledWith("week");
	});

	test("jumps to an option by typing its first letter", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		await user.keyboard("{Enter}y{Enter}");

		expect(onChange).toHaveBeenCalledWith("year");
	});

	test("skips a disabled option with the arrow keys", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				onChange={onChange}
				disabledKeys={["month"]}
			/>,
		);

		await user.tab();
		await user.keyboard("{Enter}{ArrowDown}{Enter}");

		expect(onChange).toHaveBeenCalledWith("year");
	});

	test("closes on Escape without changing the choice, and keeps focus on the trigger", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		await user.keyboard("{Enter}{ArrowDown}{Escape}");

		await waitFor(() =>
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
		);
		expect(onChange).not.toHaveBeenCalled();
		await waitFor(() => expect(trigger()).toHaveFocus());
	});

	test("Tab goes to the next control and does not get stuck", async () => {
		const user = userEvent.setup();
		render(
			<>
				<Controlled />
				<button>Next</button>
			</>,
		);

		await user.tab();
		await user.tab();

		expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
	});
});

describe("hint, optional, counter and error", () => {
	test("reads the hint with the trigger", () => {
		render(<Controlled hint="How often it repeats." />);

		expect(trigger()).toHaveAccessibleDescription("How often it repeats.");
	});

	test("shows the optional mark and the counter", () => {
		render(
			<Controlled
				optional
				counter="1 / 3"
			/>,
		);

		expect(screen.getByText("(optional)")).toBeVisible();
		expect(screen.getByText("1 / 3")).toBeVisible();
	});

	test("is valid by default and has the plain edge", () => {
		render(<Controlled />);

		expect(trigger()).not.toHaveAttribute("aria-invalid");
		expect(trigger()).toHaveClass("border-edge", "aria-expanded:border-accent");
	});

	test("reads the error instead of the hint and draws a red edge", () => {
		render(
			<Controlled
				hint="How often it repeats."
				error="Pick a unit."
			/>,
		);

		expect(trigger()).toHaveAccessibleDescription("Pick a unit.");
		expect(screen.queryByText("How often it repeats.")).not.toBeInTheDocument();
		expect(trigger()).toHaveClass("border-neg");
		expect(trigger()).not.toHaveClass("border-edge");
	});

	test("still opens and chooses while it shows an error", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				error="Pick a unit."
				onChange={onChange}
			/>,
		);

		await user.click(trigger());
		await user.click(screen.getByRole("option", { name: "years" }));

		expect(onChange).toHaveBeenCalledWith("year");
	});
});

describe("forms", () => {
	test("submits the chosen value under its name", () => {
		render(
			<form data-testid="form">
				<Controlled
					name="unit"
					initial="month"
				/>
			</form>,
		);

		expect(
			new FormData(screen.getByTestId("form") as HTMLFormElement).get("unit"),
		).toBe("month");
	});

	test("is marked required, on the root and on the hidden native select", () => {
		const { container } = render(<Controlled isRequired />);

		expect(
			container.querySelector(".flex.flex-col[data-required]"),
		).toBeInTheDocument();
		expect(container.querySelector("select")).toBeRequired();
	});
});

describe("browser autofill", () => {
	test("a value set on the hidden native select chooses that option", () => {
		const onChange = vi.fn();
		const { container } = render(<Controlled onChange={onChange} />);

		fireEvent.change(container.querySelector("select")!, {
			target: { value: "year" },
		});

		expect(onChange).toHaveBeenCalledWith("year");
		expect(trigger()).toHaveTextContent("years");
	});

	test("an empty value from the native select changes nothing", () => {
		const onChange = vi.fn();
		const { container } = render(<Controlled onChange={onChange} />);

		fireEvent.change(container.querySelector("select")!, {
			target: { value: "" },
		});

		expect(onChange).not.toHaveBeenCalledWith(null);
		expect(trigger()).toBeInTheDocument();
	});
});

describe("disabled", () => {
	test("does not open, cannot be focused, and has the soft background", async () => {
		const user = userEvent.setup();
		render(<Controlled isDisabled />);

		await user.click(trigger());
		await user.tab();

		expect(trigger()).toBeDisabled();
		expect(trigger()).not.toHaveFocus();
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(trigger()).toHaveClass("disabled:bg-soft", "disabled:text-ink-3");
	});

	test("does not open from the keyboard either", async () => {
		const user = userEvent.setup();
		render(<Controlled isDisabled />);

		await user.keyboard("{Enter}{ArrowDown}");

		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	test("still reads its hint", () => {
		render(
			<Controlled
				isDisabled
				hint="Fixed once you have data."
			/>,
		);

		expect(trigger()).toHaveAccessibleDescription("Fixed once you have data.");
	});
});

describe("many options", () => {
	test("lists them all in a list that can scroll", async () => {
		const user = userEvent.setup();
		render(
			<Select
				label="Year"
				options={Array.from({ length: 40 }, (_, index) => 1990 + index)}
				value={2000}
				onChange={() => {}}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Year/ }));

		const list = screen.getByRole("listbox");
		expect(within(list).getAllByRole("option")).toHaveLength(40);
		expect(list).toHaveClass("max-h-70", "overflow-auto");
	});

	test("changes its options when the parent does", async () => {
		const user = userEvent.setup();
		const { rerender } = render(
			<Select
				label="Unit"
				options={units}
				value="week"
				onChange={() => {}}
			/>,
		);

		rerender(
			<Select
				label="Unit"
				options={[{ value: "week", label: "weeks" }]}
				value="week"
				onChange={() => {}}
			/>,
		);
		await user.click(trigger());

		expect(screen.getAllByRole("option")).toHaveLength(1);
	});
});
