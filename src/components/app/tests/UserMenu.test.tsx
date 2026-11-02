import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { UserMenu, type UserMenuProps } from "../UserMenu";

function renderMenu(props: Partial<UserMenuProps> = {}) {
	const onLogout = vi.fn();
	const view = render(
		<UserMenu
			name="Asha Rao"
			email="asha@example.com"
			onLogout={onLogout}
			{...props}
		/>,
	);
	const trigger = screen.getByRole("button", { name: "Account menu" });
	return { ...view, trigger, onLogout };
}

async function open(props: Partial<UserMenuProps> = {}) {
	const user = userEvent.setup();
	const rendered = renderMenu(props);
	await user.click(rendered.trigger);
	const menu = await screen.findByRole("menu", { name: "Account menu" });
	return { ...rendered, user, menu };
}

describe("UserMenu trigger", () => {
	test("is a button named Account menu, closed at first", () => {
		const { trigger } = renderMenu();
		expect(trigger).toHaveAttribute("aria-haspopup", "true");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("menu")).toBeNull();
	});

	test.each([
		["Asha Rao", "AR"],
		["Asha", "AS"],
		["asha rao gupta", "AR"],
		["  Asha   Rao  ", "AR"],
		["Élodie Durand", "ÉD"],
		["李 小龍", "李小"],
		["A", "A"],
	])("%j shows %j", (name, letters) => {
		const { trigger } = renderMenu({ name });
		expect(trigger).toHaveTextContent(letters);
		expect(trigger.querySelector("svg")).toBeNull();
	});

	test.each(["🙂", "---", "  "])(
		"a name with no letters or digits (%j) shows a person icon instead",
		(name) => {
			const { trigger } = renderMenu({ name });
			expect(trigger).toHaveTextContent("");
			expect(trigger.querySelector("svg")).toHaveAttribute(
				"aria-hidden",
				"true",
			);
		},
	);

	test("its name stays Account menu, whatever the initials", () => {
		const { trigger } = renderMenu({ name: "Zed Q" });
		expect(trigger).toHaveAccessibleName("Account menu");
	});

	test("takes a class name", () => {
		const { trigger } = renderMenu({ className: "ml-2" });
		expect(trigger).toHaveClass("ml-2");
	});
});

describe("UserMenu (D-504)", () => {
	test("opens with the name, the email and Log out, and nothing else", async () => {
		const { menu, trigger } = await open();
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(within(menu).getByText("Asha Rao")).toBeInTheDocument();
		expect(within(menu).getByText("asha@example.com")).toBeInTheDocument();
		expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((item) => item.textContent),
		).toEqual(["Log out"]);
	});

	test("the name and email label the group that holds Log out", async () => {
		const { menu } = await open();
		const group = within(menu).getByRole("group");
		const label = document.getElementById(
			group.getAttribute("aria-labelledby") ?? "",
		);
		expect(label?.textContent).toBe("Asha Rao asha@example.com");
		expect(
			within(group).getByRole("menuitem", { name: "Log out" }),
		).toBeInTheDocument();
	});

	test("the name and email are not items to choose", async () => {
		const { menu } = await open();
		expect(within(menu).queryByRole("menuitem", { name: /Asha/ })).toBeNull();
	});

	test("a long name and email are shown whole, wrapping anywhere", async () => {
		const name = "Aashirwad Venkataraghavan Subramaniam Iyer-Krishnamurthy";
		const email = `${"a".repeat(64)}@${"verylongdomainname".repeat(3)}.example.com`;
		const { menu } = await open({ name, email });
		expect(within(menu).getByText(name)).toHaveClass("wrap-anywhere");
		expect(within(menu).getByText(email)).toHaveClass("wrap-anywhere");
	});

	test("Log out with the mouse calls onLogout once and closes the menu", async () => {
		const { user, menu, onLogout } = await open();
		await user.click(within(menu).getByRole("menuitem", { name: "Log out" }));
		expect(onLogout).toHaveBeenCalledOnce();
		expect(screen.queryByRole("menu")).toBeNull();
	});

	test.each(["{Enter}", " "])(
		"opens from the keyboard with %s, with focus on Log out",
		async (key) => {
			const user = userEvent.setup();
			const { trigger } = renderMenu();
			trigger.focus();
			await user.keyboard(key);
			const menu = await screen.findByRole("menu");
			expect(
				within(menu).getByRole("menuitem", { name: "Log out" }),
			).toHaveFocus();
		},
	);

	test("ArrowDown opens it too", async () => {
		const user = userEvent.setup();
		const { trigger } = renderMenu();
		trigger.focus();
		await user.keyboard("{ArrowDown}");
		expect(
			within(await screen.findByRole("menu")).getByRole("menuitem", {
				name: "Log out",
			}),
		).toHaveFocus();
	});

	test("Enter on Log out logs out", async () => {
		const user = userEvent.setup();
		const { trigger, onLogout } = renderMenu();
		trigger.focus();
		await user.keyboard("{Enter}");
		await screen.findByRole("menu");
		await user.keyboard("{Enter}");
		expect(onLogout).toHaveBeenCalledOnce();
	});

	test("Escape closes it without logging out, and focus goes back to the button", async () => {
		const { user, trigger, onLogout } = await open();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("menu")).toBeNull();
		await waitFor(() => expect(trigger).toHaveFocus());
		expect(onLogout).not.toHaveBeenCalled();
	});

	test("a press outside closes it without logging out", async () => {
		const { user, onLogout } = await open();
		await user.click(document.body);
		expect(screen.queryByRole("menu")).toBeNull();
		expect(onLogout).not.toHaveBeenCalled();
	});

	// D-515: no second press while a logout runs.
	test("while logging out, Log out is disabled and does nothing", async () => {
		const { user, menu, onLogout } = await open({ loggingOut: true });
		const item = within(menu).getByRole("menuitem", { name: "Log out" });
		expect(item).toHaveAttribute("aria-disabled", "true");
		await user.click(item);
		await user.keyboard("{Enter}");
		expect(onLogout).not.toHaveBeenCalled();
	});
});
