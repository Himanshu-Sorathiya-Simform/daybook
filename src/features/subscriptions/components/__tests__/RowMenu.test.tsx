import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { MenuItem } from "../../lib/menu";
import { RowMenu } from "../RowMenu";

const ITEMS: MenuItem[] = [
	{ action: "edit", label: "Edit" },
	{ action: "viewCharges", label: "View charges" },
	{ action: "delete", label: "Delete", danger: true, separatorBefore: true },
];

function setup(items: MenuItem[] = ITEMS) {
	const onAction = vi.fn();
	const user = userEvent.setup();
	render(
		<RowMenu
			name="Netflix"
			items={items}
			onAction={onAction}
		/>,
	);
	return { onAction, user };
}

const trigger = () => screen.getByRole("button", { name: "Actions for Netflix" });

describe("RowMenu (BR-F05-22)", () => {
	test("is a button named Actions for the Subscription, closed at first", () => {
		setup();
		expect(trigger()).toBeVisible();
		expect(trigger()).toHaveAttribute("aria-haspopup", "true");
		expect(trigger()).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("menu")).toBeNull();
	});

	test("names the button from the Subscription, whatever its name", () => {
		render(
			<RowMenu
				name="Cult Gym"
				items={ITEMS}
				onAction={vi.fn()}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Actions for Cult Gym" }),
		).toBeVisible();
	});

	test("opens a menu with the items in the order given", async () => {
		const { user } = setup();
		await user.click(trigger());
		expect(
			screen.getAllByRole("menuitem").map((item) => item.textContent),
		).toEqual(["Edit", "View charges", "Delete"]);
	});

	test("choosing an item runs its action, once, and closes the menu", async () => {
		const { user, onAction } = setup();
		await user.click(trigger());
		await user.click(screen.getByRole("menuitem", { name: "View charges" }));
		expect(onAction).toHaveBeenCalledExactlyOnceWith("viewCharges");
		expect(screen.queryByRole("menu")).toBeNull();
	});

	test("each item runs its own action", async () => {
		const { user, onAction } = setup();
		await user.click(trigger());
		await user.click(screen.getByRole("menuitem", { name: "Delete" }));
		expect(onAction).toHaveBeenCalledExactlyOnceWith("delete");
	});

	test("the keyboard opens it, moves through it and chooses", async () => {
		const { user, onAction } = setup();
		trigger().focus();
		await user.keyboard("{Enter}");
		expect(screen.getByRole("menu")).toBeVisible();
		await user.keyboard("{ArrowDown}{Enter}");
		expect(onAction).toHaveBeenCalledExactlyOnceWith("viewCharges");
	});

	test("Escape closes it without running anything, and focus returns to the button", async () => {
		const { user, onAction } = setup();
		await user.click(trigger());
		await user.keyboard("{Escape}");
		await vi.waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(onAction).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(trigger()).toHaveFocus());
	});

	test("one item still makes a menu", async () => {
		const { user, onAction } = setup([
			{ action: "viewCharges", label: "View charges" },
		]);
		await user.click(trigger());
		expect(screen.getAllByRole("menuitem")).toHaveLength(1);
		await user.click(screen.getByRole("menuitem"));
		expect(onAction).toHaveBeenCalledExactlyOnceWith("viewCharges");
	});

	test("Delete is in the danger colour and still says what it does", async () => {
		const { user } = setup();
		await user.click(trigger());
		expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass(
			"text-neg",
		);
		expect(screen.getByRole("menuitem", { name: "Edit" })).not.toHaveClass(
			"text-neg",
		);
	});
});
