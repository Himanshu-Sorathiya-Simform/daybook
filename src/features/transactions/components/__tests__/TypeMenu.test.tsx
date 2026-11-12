import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { TxnType } from "@/lib/transactions/model";
import { TypeMenu, type TypeMenuProps } from "../TypeMenu";

/** Check B's type counts (F03 section 5): October, food applied. */
const COUNTS: Record<TxnType, number> = {
	expense: 4,
	income: 0,
	refund: 0,
	goal_contribution: 0,
	goal_withdrawal: 0,
};

function renderMenu(props: Partial<TypeMenuProps> = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [value, setValue] = useState(props.value);
		return (
			<TypeMenu
				{...props}
				value={value}
				onChange={(next) => {
					onChange(next);
					setValue(next);
				}}
			/>
		);
	}
	render(<Harness />);
	return { user, onChange };
}

const trigger = (name: string | RegExp = /^Type/) =>
	screen.getByRole("button", { name, hidden: true });
const open = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(trigger());
	return screen.findByRole("dialog", { name: "Type" });
};
const box = (name: string) =>
	screen.getByRole("checkbox", { name: new RegExp(`^${name}`) });

describe("the trigger (BR-F03-39)", () => {
	test("reads Type Any with nothing chosen, and is not marked active", () => {
		renderMenu();

		expect(trigger("Type Any")).toBeInTheDocument();
		expect(trigger()).toHaveClass("border-edge");
	});

	test("reads the one chosen type's name, with the active outline", () => {
		renderMenu({ value: ["refund"] });

		expect(trigger("Type Refund")).toHaveClass("border-accent");
	});

	test("reads how many types are chosen when several are", () => {
		renderMenu({ value: ["expense", "refund"] });

		expect(trigger("Type 2")).toBeInTheDocument();
	});
});

describe("the choices", () => {
	test("offers Expense, Income and Refund, and no Goal type until M2", async () => {
		const { user } = renderMenu();

		const dialog = await open(user);

		expect(
			within(dialog)
				.getAllByRole("checkbox")
				.map((each) => each.closest("label")!.textContent),
		).toEqual(["Expense", "Income", "Refund"]);
		expect(
			within(dialog).getByRole("group", { name: "Type" }),
		).toBeInTheDocument();
	});

	test("shows each type's count once the counts arrive", async () => {
		const { user } = renderMenu({ counts: COUNTS });

		await open(user);

		expect(box("Expense").closest("label")).toHaveTextContent("Expense 4");
		expect(box("Income").closest("label")).toHaveTextContent("Income 0");
	});

	test("holds each count's place while the counts load", async () => {
		const { user } = renderMenu({ countsPending: true });

		const dialog = await open(user);

		expect(dialog.querySelectorAll("label .bg-track")).toHaveLength(3);
	});

	test("shows the counts, not placeholders, once they arrive", async () => {
		const { user } = renderMenu({ countsPending: true, counts: COUNTS });

		const dialog = await open(user);

		expect(dialog.querySelectorAll("label .bg-track")).toHaveLength(0);
	});

	test("shows no counts before they arrive", async () => {
		const { user } = renderMenu();

		await open(user);

		expect(box("Expense").closest("label")).toHaveTextContent(/^Expense$/);
	});

	test("ticks the chosen types", async () => {
		const { user } = renderMenu({ value: ["income"] });

		await open(user);

		expect(box("Income")).toBeChecked();
		expect(box("Expense")).not.toBeChecked();
	});
});

describe("committing", () => {
	test("a press adds a type and commits at once, keeping the popover open", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(box("Refund"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["refund"]);
		expect(screen.getByRole("dialog", { name: "Type" })).toBeInTheDocument();
		expect(box("Refund")).toBeChecked();
	});

	test("a second type joins the first", async () => {
		const { user, onChange } = renderMenu({ value: ["expense"] });

		await open(user);
		await user.click(box("Income"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["expense", "income"]);
	});

	test("unticking one of two keeps the other", async () => {
		const { user, onChange } = renderMenu({ value: ["expense", "income"] });

		await open(user);
		await user.click(box("Expense"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["income"]);
	});

	test("unticking the last type drops the filter", async () => {
		const { user, onChange } = renderMenu({ value: ["refund"] });

		await open(user);
		await user.click(box("Refund"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
	});

	test("Space ticks the focused type from the keyboard", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.keyboard("{Tab} ");

		expect(onChange).toHaveBeenCalledTimes(1);
	});

	test("a Goal type chosen by a link is kept when another is ticked", async () => {
		const { user, onChange } = renderMenu({ value: ["goal_contribution"] });

		await open(user);
		await user.click(box("Expense"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith([
			"goal_contribution",
			"expense",
		]);
	});
});

describe("opening", () => {
	test("tells the caller when it opens and closes, for the counts", async () => {
		const onOpenChange = vi.fn();
		const { user } = renderMenu({ onOpenChange });

		await open(user);
		await user.keyboard("{Escape}");

		expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
	});
});

describe("className", () => {
	test("goes on the trigger, after its own classes", () => {
		renderMenu({ className: "ms-auto" });

		expect(trigger()).toHaveClass("inline-flex", "ms-auto");
	});
});
