import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { StateCount, type StateCountProps } from "../StateCount";

function renderCount(props: Partial<StateCountProps> = {}) {
	const onChange = vi.fn();
	render(
		<StateCount
			state="over"
			count={2}
			isSelected={false}
			onChange={onChange}
			{...props}
		/>,
	);
	return { onChange, user: userEvent.setup() };
}

const button = () => screen.getByRole("button");

describe("StateCount (BR-F04-15, BR-F04-31)", () => {
	test("a toggle named by its state and count, not pressed at first", () => {
		renderCount();
		expect(
			screen.getByRole("button", { name: "Over budget 2" }),
		).toHaveAttribute("aria-pressed", "false");
	});

	test.each([
		["over", "Over budget"],
		["at", "At limit"],
		["warning", "Nearing limit"],
		["ok", "On track"],
	] as const)("%s reads %s", (state, label) => {
		renderCount({ state });
		expect(button()).toHaveAccessibleName(`${label} 2`);
	});

	test("pressing it asks for the filter; pressing it while chosen asks to clear it", async () => {
		const { user, onChange } = renderCount();
		await user.click(button());
		expect(onChange).toHaveBeenLastCalledWith(true);
		const chosen = renderCount({ isSelected: true });
		await chosen.user.click(screen.getAllByRole("button")[1] as HTMLElement);
		expect(chosen.onChange).toHaveBeenLastCalledWith(false);
	});

	test("Enter and Space press it", async () => {
		const { user, onChange } = renderCount();
		await user.tab();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	test("chosen, it is announced as pressed and tinted, its label in the accent", () => {
		renderCount({ isSelected: true });
		expect(button()).toHaveAttribute("aria-pressed", "true");
		expect(button()).toHaveClass("selected:bg-accent-soft");
		expect(screen.getByText("Over budget")).toHaveClass("text-accent");
	});

	test("a state with Budgets takes its colour; one with none is muted", () => {
		const { rerender } = render(
			<StateCount
				state="over"
				count={2}
				isSelected={false}
				onChange={vi.fn()}
			/>,
		);
		expect(screen.getByText("Over budget")).toHaveClass(
			"text-neg",
			"font-semibold",
		);
		rerender(
			<StateCount
				state="over"
				count={0}
				isSelected={false}
				onChange={vi.fn()}
			/>,
		);
		expect(screen.getByText("Over budget")).toHaveClass("text-ink-2");
		expect(screen.getByText("0")).toHaveClass("text-ink-3");
	});

	test("Nearing limit and At limit take the warning colour; On track stays plain", () => {
		const { rerender } = render(
			<StateCount
				state="warning"
				count={1}
				isSelected={false}
				onChange={vi.fn()}
			/>,
		);
		expect(screen.getByText("Nearing limit")).toHaveClass("text-warn");
		rerender(
			<StateCount
				state="ok"
				count={1}
				isSelected={false}
				onChange={vi.fn()}
			/>,
		);
		expect(screen.getByText("On track")).toHaveClass("text-ink");
	});

	test("44px on phones, and takes the caller's classes", () => {
		renderCount({ className: "mt-1" });
		expect(button()).toHaveClass("max-md:min-h-11", "mt-1");
	});
});
