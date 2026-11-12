import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { ToggleChips, type ToggleChipsProps } from "@/components/forms/ToggleChips";

/** The phone sheet's Type chips (BR-F03-39). */
const TYPES = [
	{ value: "expense", label: "Expense" },
	{ value: "income", label: "Income" },
	{ value: "refund", label: "Refund" },
];

/** The phone sheet's date presets: one at a time, never none. */
const DATES = [
	{ value: "all", label: "All time" },
	{ value: "this_month", label: "This month" },
	{ value: "last_month", label: "Last month" },
];

function renderChips(props: Partial<ToggleChipsProps> = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [value, setValue] = useState<readonly string[]>(props.value ?? []);
		return (
			<ToggleChips
				label="Type"
				options={TYPES}
				{...props}
				value={value}
				onChange={(next) => {
					onChange(next);
					setValue(next);
				}}
			/>
		);
	}
	const view = render(
		<>
			<button type="button">Before</button>
			<Harness />
			<button type="button">After</button>
		</>,
	);
	return { ...view, user, onChange };
}

const single = (value: readonly string[] = ["all"]) =>
	renderChips({
		label: "Date",
		options: DATES,
		selectionMode: "single",
		value,
	});

describe("several at a time", () => {
	test("is a toolbar of toggle buttons named by its label", () => {
		renderChips();

		expect(screen.getByRole("toolbar", { name: "Type" })).toBeInTheDocument();
		expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(3);
	});

	test("a press chooses a chip", async () => {
		const { user, onChange } = renderChips();

		await user.click(screen.getByRole("button", { name: "Income" }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["income"]);
		expect(screen.getByRole("button", { name: "Income" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	test("a press on a chosen chip lets it go", async () => {
		const { user, onChange } = renderChips({ value: ["income"] });

		await user.click(screen.getByRole("button", { name: "Income" }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith([]);
	});

	test("reports the chosen chips in the order of the options, not of the presses", async () => {
		const { user, onChange } = renderChips();

		await user.click(screen.getByRole("button", { name: "Refund" }));
		await user.click(screen.getByRole("button", { name: "Expense" }));

		expect(onChange).toHaveBeenLastCalledWith(["expense", "refund"]);
	});

	test("shows the chips it is given as chosen", () => {
		renderChips({ value: ["expense", "refund"] });

		expect(
			screen
				.getAllByRole("button", { pressed: true })
				.map((chip) => chip.textContent),
		).toEqual(["Expense", "Refund"]);
	});
});

describe("one at a time", () => {
	test("is a radio group named by its label", () => {
		single();

		expect(screen.getByRole("radiogroup", { name: "Date" })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "All time" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "This month" })).not.toBeChecked();
	});

	test("a press on another chip moves the choice there", async () => {
		const { user, onChange } = single();

		await user.click(screen.getByRole("radio", { name: "Last month" }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["last_month"]);
		expect(screen.getByRole("radio", { name: "Last month" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "All time" })).not.toBeChecked();
	});

	test("a press on the chosen chip keeps it chosen and reports nothing", async () => {
		const { user, onChange } = single();

		await user.click(screen.getByRole("radio", { name: "All time" }));

		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByRole("radio", { name: "All time" })).toBeChecked();
	});
});

describe("the keyboard", () => {
	test("the group is one Tab stop", async () => {
		const { user } = renderChips();

		await user.tab();
		await user.tab();
		expect(screen.getByRole("button", { name: "Expense" })).toHaveFocus();
		await user.tab();

		expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
	});

	test("arrow keys move between chips without choosing", async () => {
		const { user, onChange } = renderChips();

		await user.tab();
		await user.tab();
		await user.keyboard("{ArrowRight}{ArrowRight}");
		expect(screen.getByRole("button", { name: "Refund" })).toHaveFocus();
		await user.keyboard("{ArrowLeft}");

		expect(screen.getByRole("button", { name: "Income" })).toHaveFocus();
		expect(onChange).not.toHaveBeenCalled();
	});

	test("Space presses the focused chip, and Enter too", async () => {
		const { user, onChange } = renderChips();

		await user.tab();
		await user.tab();
		await user.keyboard(" ");
		expect(onChange).toHaveBeenLastCalledWith(["expense"]);
		await user.keyboard("{ArrowRight}{Enter}");

		expect(onChange).toHaveBeenLastCalledWith(["expense", "income"]);
	});

	test("Tab comes back to the chip last focused", async () => {
		const { user } = renderChips();

		await user.tab();
		await user.tab();
		await user.keyboard("{ArrowRight}");
		await user.tab();
		await user.tab({ shift: true });

		expect(screen.getByRole("button", { name: "Income" })).toHaveFocus();
	});

	test("with one choice, Space chooses the focused chip", async () => {
		const { user, onChange } = single();

		await user.tab();
		await user.tab();
		await user.keyboard("{ArrowRight} ");

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["this_month"]);
	});
});

describe("how it looks", () => {
	test("a chosen chip has the accent outline, the tint and a check mark", () => {
		renderChips({ value: ["income"] });

		const chosen = screen.getByRole("button", { name: "Income" });
		expect(chosen).toHaveAttribute("data-selected", "true");
		expect(chosen).toHaveClass(
			"selected:border-accent",
			"selected:bg-accent-soft",
			"selected:border-[1.5px]",
		);
		expect(chosen.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
	});

	test("a chip not chosen has no check mark", () => {
		renderChips({ value: ["income"] });

		expect(
			screen.getByRole("button", { name: "Expense" }).querySelector("svg"),
		).toBeNull();
	});

	test("a chip is 40px tall, 44px on phones", () => {
		renderChips();

		expect(screen.getByRole("button", { name: "Expense" })).toHaveClass(
			"h-10",
			"max-md:min-h-11",
		);
	});

	test("the chips wrap, and the caller's classes go on the group", () => {
		renderChips({ className: "mt-2" });

		expect(screen.getByRole("toolbar")).toHaveClass("flex", "flex-wrap", "mt-2");
	});
});

describe("disabled and following its props", () => {
	test("disabled, its chips cannot be focused or pressed", async () => {
		const { user, onChange } = renderChips({ isDisabled: true });

		await user.tab();
		await user.tab();
		expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
		await user.click(screen.getByRole("button", { name: "Income" }));

		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Income" })).toHaveClass(
			"disabled:border-dashed",
		);
	});

	test("a new value from the caller changes the chosen chips", () => {
		const props = { label: "Type", options: TYPES, onChange: () => {} };
		const { rerender } = render(
			<ToggleChips
				{...props}
				value={["expense"]}
			/>,
		);
		rerender(
			<ToggleChips
				{...props}
				value={["refund"]}
			/>,
		);

		expect(
			screen
				.getAllByRole("button", { pressed: true })
				.map((chip) => chip.textContent),
		).toEqual(["Refund"]);
	});

	test("new options from the caller show as chips", () => {
		const props = { label: "Type", value: [], onChange: () => {} };
		const { rerender } = render(
			<ToggleChips
				{...props}
				options={TYPES}
			/>,
		);
		rerender(
			<ToggleChips
				{...props}
				options={[
					...TYPES,
					{ value: "goal_contribution", label: "To Goal" },
				]}
			/>,
		);

		expect(screen.getByRole("button", { name: "To Goal" })).toBeInTheDocument();
	});
});
