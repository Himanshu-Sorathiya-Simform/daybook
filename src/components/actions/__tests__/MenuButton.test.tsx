import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	MenuButton,
	type MenuButtonItem,
	type MenuButtonProps,
} from "@/components/actions/MenuButton";

function items() {
	const rename = vi.fn();
	const duplicate = vi.fn();
	const remove = vi.fn();
	const list: MenuButtonItem[] = [
		{ id: "rename", label: "Rename", icon: Pencil, onAction: rename },
		{ id: "duplicate", label: "Duplicate", icon: Copy, onAction: duplicate },
		{
			id: "delete",
			label: "Delete",
			icon: Trash2,
			tone: "danger",
			onAction: remove,
		},
	];
	return { list, rename, duplicate, remove };
}

function renderMenu(props: Partial<MenuButtonProps> = {}) {
	const user = userEvent.setup();
	const actions = items();
	const view = render(
		<>
			<button type="button">Outside</button>
			<MenuButton
				label="View actions"
				items={actions.list}
				{...props}
			/>
		</>,
	);
	return { ...view, ...actions, user };
}

// While the menu is open React Aria hides the rest of the page from screen readers.
const trigger = (name = "View actions") =>
	screen.getByRole("button", { name, hidden: true });

async function open(user: ReturnType<typeof userEvent.setup>) {
	await user.click(trigger());
	return screen.findByRole("menu", { name: "View actions" });
}

const closed = () =>
	waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

const focusBack = () => waitFor(() => expect(trigger()).toHaveFocus());

describe("trigger", () => {
	test("is a button named by its visible label, closed at first", () => {
		renderMenu();

		expect(trigger()).toHaveTextContent("View actions");
		expect(trigger()).toHaveAttribute("aria-haspopup", "true");
		expect(trigger()).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("menu")).toBeNull();
	});

	test("has a chevron, hidden from screen readers", () => {
		renderMenu();

		const svgs = trigger().querySelectorAll("svg");
		expect(svgs).toHaveLength(1);
		expect(svgs[0]).toHaveClass("lucide-chevron-down");
		expect(svgs[0]).toHaveAttribute("aria-hidden", "true");
	});

	test("shows an icon before the label, hidden from screen readers", () => {
		renderMenu({ icon: Pencil });

		const [icon, chevron] = Array.from(trigger().querySelectorAll("svg"));
		expect(icon).toHaveClass("lucide-pencil");
		expect(icon).toHaveAttribute("aria-hidden", "true");
		expect(chevron).toHaveClass("lucide-chevron-down");
		expect(trigger().querySelector("span")).not.toHaveClass("sr-only");
	});

	test("with hideLabel shows only the icon, as a square, still named by the label", () => {
		renderMenu({ icon: MoreHorizontal, hideLabel: true });

		expect(trigger()).toBeInTheDocument();
		expect(trigger().querySelector("span")).toHaveClass("sr-only");
		expect(trigger().querySelectorAll("svg")).toHaveLength(1);
		expect(trigger()).toHaveClass("size-8", "justify-center", "max-md:size-11");
		expect(trigger()).not.toHaveAttribute("aria-label");
	});

	test("keeps the label shown when hideLabel has no icon to show instead", () => {
		renderMenu({ hideLabel: true });

		expect(trigger().querySelector("span")).not.toHaveClass("sr-only");
		expect(trigger()).not.toHaveClass("size-8");
		expect(trigger().querySelector(".lucide-chevron-down")).toBeInTheDocument();
	});

	test("looks like a small secondary button, 44px on phones", () => {
		renderMenu();

		expect(trigger()).toHaveClass(
			"border-line-strong",
			"bg-page",
			"h-8",
			"max-md:min-h-11",
		);
	});

	test("takes the caller's classes", () => {
		renderMenu({ className: "ml-auto" });

		expect(trigger()).toHaveClass("ml-auto");
	});
});

describe("opening", () => {
	test("a press opens a menu named by the button, with the items in order", async () => {
		const { user } = renderMenu();

		const menu = await open(user);

		expect(trigger()).toHaveAttribute("aria-expanded", "true");
		expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((item) => item.textContent),
		).toEqual(["Rename", "Duplicate", "Delete"]);
	});

	test("shows each item's icon, hidden from screen readers", async () => {
		const { user } = renderMenu();
		const menu = await open(user);

		const rename = within(menu).getByRole("menuitem", { name: "Rename" });
		expect(rename.querySelector("svg")).toHaveClass("lucide-pencil");
		expect(rename.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
	});

	test("an item with no icon shows only its label", async () => {
		const { user } = renderMenu({
			items: [{ id: "a", label: "Rename", onAction: () => {} }],
		});
		const menu = await open(user);

		expect(
			within(menu)
				.getByRole("menuitem", { name: "Rename" })
				.querySelector("svg"),
		).toBeNull();
	});

	test.each(["{Enter}", " ", "{ArrowDown}"])(
		"%j on the button opens it on the first item",
		async (key) => {
			const { user } = renderMenu();
			trigger().focus();

			await user.keyboard(key);

			const menu = await screen.findByRole("menu");
			await waitFor(() =>
				expect(
					within(menu).getByRole("menuitem", { name: "Rename" }),
				).toHaveFocus(),
			);
		},
	);

	test("Up on the button opens it on the last item", async () => {
		const { user } = renderMenu();
		trigger().focus();

		await user.keyboard("{ArrowUp}");

		const menu = await screen.findByRole("menu");
		await waitFor(() =>
			expect(
				within(menu).getByRole("menuitem", { name: "Delete" }),
			).toHaveFocus(),
		);
	});

	test("can be open from the start", async () => {
		renderMenu({ defaultOpen: true });

		expect(await screen.findByRole("menu")).toBeVisible();
	});
});

describe("running an item", () => {
	test("a press runs the item once, closes the menu and puts focus back on the button", async () => {
		const { user, rename, duplicate, remove } = renderMenu();
		const menu = await open(user);

		await user.click(within(menu).getByRole("menuitem", { name: "Rename" }));

		expect(rename).toHaveBeenCalledOnce();
		expect(duplicate).not.toHaveBeenCalled();
		expect(remove).not.toHaveBeenCalled();
		await closed();
		await focusBack();
	});

	test("the arrows move and Enter runs the focused item", async () => {
		const { user, duplicate, rename } = renderMenu();
		trigger().focus();
		await user.keyboard("{Enter}");
		await screen.findByRole("menu");

		await user.keyboard("{ArrowDown}{Enter}");

		expect(duplicate).toHaveBeenCalledOnce();
		expect(rename).not.toHaveBeenCalled();
		await closed();
		await focusBack();
	});

	test("Space runs the focused item too", async () => {
		const { user, remove } = renderMenu();
		trigger().focus();
		await user.keyboard("{ArrowUp}");
		await screen.findByRole("menu");

		await user.keyboard(" ");

		expect(remove).toHaveBeenCalledOnce();
		await closed();
	});

	test("Down from the last item wraps round to the first", async () => {
		const { user, rename } = renderMenu();
		trigger().focus();
		await user.keyboard("{ArrowUp}");
		await screen.findByRole("menu");

		await user.keyboard("{ArrowDown}{Enter}");

		expect(rename).toHaveBeenCalledOnce();
	});

	test("typing a letter jumps to the item that starts with it", async () => {
		const { user, remove } = renderMenu();
		trigger().focus();
		await user.keyboard("{Enter}");
		const menu = await screen.findByRole("menu");

		await user.keyboard("de");

		await waitFor(() =>
			expect(
				within(menu).getByRole("menuitem", { name: "Delete" }),
			).toHaveFocus(),
		);
		await user.keyboard("{Enter}");
		expect(remove).toHaveBeenCalledOnce();
	});

	test("two items with the same label run their own actions", async () => {
		const first = vi.fn();
		const second = vi.fn();
		const { user } = renderMenu({
			items: [
				{ id: "a", label: "Open", onAction: first },
				{ id: "b", label: "Open", onAction: second },
			],
		});
		const menu = await open(user);

		await user.click(within(menu).getAllByRole("menuitem")[1]!);

		expect(second).toHaveBeenCalledOnce();
		expect(first).not.toHaveBeenCalled();
	});
});

describe("closing without an action", () => {
	test("Escape closes it, runs nothing and puts focus back on the button", async () => {
		const { user, rename, duplicate, remove } = renderMenu();
		await open(user);

		await user.keyboard("{Escape}");

		await closed();
		await focusBack();
		expect(trigger()).toHaveAttribute("aria-expanded", "false");
		for (const action of [rename, duplicate, remove])
			expect(action).not.toHaveBeenCalled();
	});

	test("a press outside closes it and runs nothing", async () => {
		const { user, rename } = renderMenu();
		await open(user);

		await user.click(document.body);

		await closed();
		expect(rename).not.toHaveBeenCalled();
	});

	test("a second press on the button closes it", async () => {
		const { user } = renderMenu();
		await open(user);

		await user.click(trigger());

		await closed();
	});
});

describe("disabled items", () => {
	function withDisabled() {
		const rename = vi.fn();
		const remove = vi.fn();
		return {
			rename,
			remove,
			props: {
				items: [
					{
						id: "rename",
						label: "Rename",
						isDisabled: true,
						onAction: rename,
					},
					{
						id: "delete",
						label: "Delete",
						tone: "danger",
						onAction: remove,
					},
				] satisfies MenuButtonItem[],
			},
		};
	}

	test("say so, look dimmed and run nothing when pressed", async () => {
		const { rename, props } = withDisabled();
		const { user } = renderMenu(props);
		const menu = await open(user);

		const item = within(menu).getByRole("menuitem", { name: "Rename" });
		expect(item).toHaveAttribute("aria-disabled", "true");
		expect(item).toHaveClass("disabled:text-ink-3");
		await user.click(item);

		expect(rename).not.toHaveBeenCalled();
		expect(screen.getByRole("menu")).toBeVisible();
	});

	test("are skipped by the arrows", async () => {
		const { rename, remove, props } = withDisabled();
		const { user } = renderMenu(props);
		trigger().focus();
		await user.keyboard("{Enter}");
		const menu = await screen.findByRole("menu");

		await waitFor(() =>
			expect(
				within(menu).getByRole("menuitem", { name: "Delete" }),
			).toHaveFocus(),
		);
		await user.keyboard("{ArrowDown}{Enter}");

		expect(remove).toHaveBeenCalledOnce();
		expect(rename).not.toHaveBeenCalled();
	});

	test("an item is enabled unless it says otherwise", async () => {
		const { user } = renderMenu();
		const menu = await open(user);

		for (const item of within(menu).getAllByRole("menuitem"))
			expect(item).not.toHaveAttribute("aria-disabled");
	});
});

describe("tone", () => {
	test("a danger item is red, and its word still says what it does", async () => {
		const { user } = renderMenu();
		const menu = await open(user);

		const item = within(menu).getByRole("menuitem", { name: "Delete" });
		expect(item).toHaveClass("text-neg");
		expect(item).not.toHaveClass("text-ink");
	});

	test("other items are in the normal ink", async () => {
		const { user } = renderMenu();
		const menu = await open(user);

		for (const name of ["Rename", "Duplicate"]) {
			const item = within(menu).getByRole("menuitem", { name });
			expect(item).toHaveClass("text-ink");
			expect(item).not.toHaveClass("text-neg");
		}
	});

	test("items are 44px tall on phones", async () => {
		const { user } = renderMenu();
		const menu = await open(user);

		expect(within(menu).getByRole("menuitem", { name: "Rename" })).toHaveClass(
			"min-h-10",
			"max-md:min-h-11",
		);
	});
});

describe("controlled", () => {
	test("reports opening and closing", async () => {
		const onOpenChange = vi.fn();
		const { user } = renderMenu({ onOpenChange });

		await open(user);
		expect(onOpenChange).toHaveBeenLastCalledWith(true);

		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
	});

	test("opens and closes as the parent says", async () => {
		const user = userEvent.setup();
		function Host() {
			const [isOpen, setOpen] = useState(false);
			return (
				<>
					<button
						type="button"
						onClick={() => setOpen(true)}
					>
						Open from outside
					</button>
					<MenuButton
						label="View actions"
						items={items().list}
						isOpen={isOpen}
						onOpenChange={setOpen}
					/>
				</>
			);
		}
		render(<Host />);

		await user.click(screen.getByRole("button", { name: "Open from outside" }));
		expect(await screen.findByRole("menu")).toBeVisible();

		await user.keyboard("{Escape}");
		await closed();
	});
});

describe("popover", () => {
	// jsdom lays nothing out, so the button is given a box from 500 to 600px; the menu, which
	// jsdom sizes at zero, then starts at the button's left or right edge.
	test.each([
		[undefined, "500px"],
		["start", "500px"],
		["end", "600px"],
	] as const)("align %s lines it up at left %s", async (align, left) => {
		const { user } = renderMenu(align ? { align } : {});
		trigger().getBoundingClientRect = () =>
			({
				x: 500,
				y: 100,
				left: 500,
				top: 100,
				right: 600,
				bottom: 132,
				width: 100,
				height: 32,
			}) as DOMRect;

		const menu = await open(user);

		expect(menu.parentElement).toHaveStyle({ left, top: "138px" });
	});

	test("is never wider than the screen", async () => {
		const { user } = renderMenu();
		const menu = await open(user);

		expect(menu.parentElement).toHaveClass(
			"max-w-[min(20rem,calc(100vw-2rem))]",
			"w-max",
		);
	});
});
