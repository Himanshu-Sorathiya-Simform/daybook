import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	type CategoryKey,
	categoryLabel,
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
} from "@/lib/categories";
import { CategoryMenu, type CategoryMenuProps } from "../CategoryMenu";

/** Check B's category counts (F03 section 5): October, every key, zeros included. */
const COUNTS = Object.fromEntries(
	[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((key) => [key, 0]),
) as Record<CategoryKey, number>;
Object.assign(COUNTS, {
	food: 4,
	entertainment: 2,
	shopping: 2,
	housing: 1,
	salary: 1,
	transportation: 1,
});

function renderMenu(props: Partial<CategoryMenuProps> = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [value, setValue] = useState(props.value);
		return (
			<CategoryMenu
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

const trigger = (name: string | RegExp = /^Category/) =>
	screen.getByRole("button", { name, hidden: true });
const open = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(trigger());
	return screen.findByRole("dialog", { name: "Category" });
};
const box = (name: string) =>
	screen.getByRole("checkbox", { name: new RegExp(`^${name}( \\d+)?$`) });

describe("the trigger (BR-F03-39)", () => {
	test("reads Category Any with nothing chosen", () => {
		renderMenu();

		expect(trigger("Category Any")).toBeInTheDocument();
		expect(trigger()).not.toHaveClass("border-accent");
	});

	test("check B reads Category Food, marked active", () => {
		renderMenu({ value: ["food"] });

		expect(trigger("Category Food")).toHaveClass("border-accent");
	});

	test("reads how many when several are chosen", () => {
		renderMenu({ value: ["food", "health", "salary"] });

		expect(trigger("Category 3")).toBeInTheDocument();
	});
});

describe("the choices", () => {
	test("lists the expense categories, then the income ones under Income", async () => {
		const { user } = renderMenu();

		const dialog = await open(user);

		const expense = within(dialog).getByRole("group", {
			name: "Expense categories",
		});
		const income = within(dialog).getByRole("group", {
			name: "Income categories",
		});
		expect(within(expense).getAllByRole("checkbox")).toHaveLength(
			EXPENSE_CATEGORIES.length,
		);
		expect(
			within(income)
				.getAllByRole("checkbox")
				.map((each) => each.closest("label")!.textContent),
		).toEqual(INCOME_CATEGORIES.map(categoryLabel));
		expect(within(dialog).getByText("Income")).toBeInTheDocument();
		expect(
			expense.compareDocumentPosition(income)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("says category filters hide Goal Transactions (BR-F03-37)", async () => {
		const { user } = renderMenu();

		const dialog = await open(user);

		expect(
			within(dialog).getByText("Category filters hide Goal Transactions."),
		).toBeInTheDocument();
	});

	// AC-F03-40
	test("shows check B's counts, zeros included", async () => {
		const { user } = renderMenu({ counts: COUNTS });

		await open(user);

		expect(box("Food").closest("label")).toHaveTextContent("Food 4");
		expect(box("Salary").closest("label")).toHaveTextContent("Salary 1");
		expect(box("Health").closest("label")).toHaveTextContent("Health 0");
	});

	test("shows no counts before they arrive", async () => {
		const { user } = renderMenu();

		await open(user);

		expect(box("Food").closest("label")).toHaveTextContent(/^Food$/);
	});
});

describe("committing", () => {
	test("a press adds a category at once and keeps the popover open", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(box("Food"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["food"]);
		expect(screen.getByRole("dialog", { name: "Category" })).toBeInTheDocument();
	});

	test("an income category joins an expense one", async () => {
		const { user, onChange } = renderMenu({ value: ["food"] });

		await open(user);
		await user.click(box("Salary"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["food", "salary"]);
	});

	test("unticking the last category drops the filter", async () => {
		const { user, onChange } = renderMenu({ value: ["food"] });

		await open(user);
		await user.click(box("Food"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
	});

	test("unticking one of two keeps the other", async () => {
		const { user, onChange } = renderMenu({ value: ["food", "shopping"] });

		await open(user);
		await user.click(box("Shopping"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(["food"]);
	});

	test("tells the caller when it opens", async () => {
		const onOpenChange = vi.fn();
		const { user } = renderMenu({ onOpenChange });

		await open(user);

		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
	});
});

describe("className", () => {
	test("goes on the trigger, after its own classes", () => {
		renderMenu({ className: "ms-auto" });

		expect(trigger()).toHaveClass("inline-flex", "ms-auto");
	});
});
