import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { ListParams } from "@/lib/transactions/url";
import { GroupSortMenu } from "../GroupSortMenu";

const DEFAULT: ListParams = { sort: "date", dir: "desc", group: "day" };

function renderMenu(list: ListParams = DEFAULT) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	const view = render(
		<GroupSortMenu
			list={list}
			onChange={onChange}
		/>,
	);
	return { ...view, user, onChange };
}

/** Keeps the list in state, as the URL does. */
function Host({ onChange }: { onChange: (list: ListParams) => void }) {
	const [list, setList] = useState(DEFAULT);
	return (
		<GroupSortMenu
			list={list}
			onChange={(next) => {
				setList(next);
				onChange(next);
			}}
		/>
	);
}

const trigger = (name: string | RegExp = /^Group and sort/) =>
	screen.getByRole("button", { name, hidden: true });

async function open(user: ReturnType<typeof userEvent.setup>) {
	await user.click(trigger());
	return screen.findByRole("dialog", { name: "Group and sort" });
}

describe("trigger (BR-F03-39)", () => {
	test('reads "Day · Newest first" by default, named for screen readers as group and sort', () => {
		renderMenu();

		expect(trigger("Group and sort Day · Newest first")).toHaveTextContent(
			/^Group and sort ?Day · Newest first$/,
		);
		expect(trigger().querySelector(".sr-only")).toHaveTextContent(
			"Group and sort",
		);
	});

	test.each([
		[
			{ sort: "amount", dir: "desc", group: "none" },
			"No grouping · Largest first",
		],
		[{ sort: "amount", dir: "asc", group: "payee" }, "Payee · Smallest first"],
		[{ sort: "date", dir: "asc", group: "category" }, "Category · Oldest first"],
	] as const)("%j reads %s", (list, label) => {
		renderMenu(list);

		expect(trigger(`Group and sort ${label}`)).toBeInTheDocument();
	});

	test("takes the caller's classes on the trigger", () => {
		render(
			<GroupSortMenu
				list={DEFAULT}
				onChange={vi.fn()}
				className="ml-auto"
			/>,
		);

		expect(trigger()).toHaveClass("ml-auto", "h-9.5");
	});

	test("never shows the active outline: grouping and sorting filter nothing", () => {
		renderMenu({ sort: "amount", dir: "asc", group: "payee" });

		expect(trigger()).toHaveClass("border-edge");
	});
});

describe("changes from outside", () => {
	test("follows a list the parent changes, as Back does", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<GroupSortMenu
				list={DEFAULT}
				onChange={onChange}
			/>,
		);

		rerender(
			<GroupSortMenu
				list={{ sort: "amount", dir: "desc", group: "payee" }}
				onChange={onChange}
			/>,
		);

		expect(trigger("Group and sort Payee · Largest first")).toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("the popover", () => {
	test("lists the groupings, then the sorts, with the current ones chosen", async () => {
		const { user } = renderMenu();
		const dialog = await open(user);

		const [groups, sorts] = within(dialog).getAllByRole("radiogroup");
		expect(groups).toHaveAccessibleName("Group by");
		expect(
			within(groups!)
				.getAllByRole("radio")
				.map((radio) => radio.closest("label")?.textContent),
		).toEqual(["Day", "Category", "Payee", "No grouping"]);
		expect(within(groups!).getByRole("radio", { name: /^Day/ })).toBeChecked();

		expect(sorts).toHaveAccessibleName("Sort");
		expect(
			within(sorts!)
				.getAllByRole("radio")
				.map((radio) => radio.closest("label")?.textContent),
		).toEqual([
			"Newest first",
			"Oldest first",
			"Largest first",
			"Smallest first",
		]);
		expect(
			within(sorts!).getByRole("radio", { name: "Newest first" }),
		).toBeChecked();
	});

	test('Day reads its description, "with day totals"', async () => {
		const { user } = renderMenu();
		const dialog = await open(user);

		expect(
			within(dialog).getByRole("radio", { name: "Day" }),
		).toHaveAccessibleDescription("with day totals");
	});

	test("shows the current choices of another list", async () => {
		const { user } = renderMenu({ sort: "amount", dir: "asc", group: "payee" });
		const dialog = await open(user);

		expect(within(dialog).getByRole("radio", { name: "Payee" })).toBeChecked();
		expect(
			within(dialog).getByRole("radio", { name: "Smallest first" }),
		).toBeChecked();
	});

	test("lines up with the trigger's end", async () => {
		const { user } = renderMenu();
		trigger().getBoundingClientRect = () =>
			({
				x: 500,
				y: 0,
				left: 500,
				top: 0,
				right: 600,
				bottom: 38,
				width: 100,
				height: 38,
			}) as DOMRect;

		const dialog = await open(user);

		expect(dialog.parentElement).toHaveStyle({ left: "600px" });
	});
});

describe("choosing (D-529)", () => {
	test.each([
		["Category", { sort: "date", dir: "desc", group: "category" }],
		["Payee", { sort: "date", dir: "desc", group: "payee" }],
		["No grouping", { sort: "date", dir: "desc", group: "none" }],
	] as const)("%s commits that grouping, keeping the sort", async (name, list) => {
		const { user, onChange } = renderMenu();
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("radio", { name }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(list);
	});

	test.each([
		["Oldest first", { sort: "date", dir: "asc", group: "day" }],
		["Largest first", { sort: "amount", dir: "desc", group: "none" }],
		["Smallest first", { sort: "amount", dir: "asc", group: "none" }],
	] as const)("%s commits that sort", async (name, list) => {
		const { user, onChange } = renderMenu();
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("radio", { name }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(list);
	});

	test("Day under an amount sort switches to the date sort in the same direction", async () => {
		const { user, onChange } = renderMenu({
			sort: "amount",
			dir: "asc",
			group: "none",
		});
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("radio", { name: /^Day/ }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			sort: "date",
			dir: "asc",
			group: "day",
		});
	});

	test("choosing what is already chosen commits nothing", async () => {
		const { user, onChange } = renderMenu();
		const dialog = await open(user);

		await user.click(
			within(dialog).getByRole("radio", { name: "Newest first" }),
		);
		await user.click(within(dialog).getByRole("radio", { name: /^Day/ }));

		expect(onChange).not.toHaveBeenCalled();
	});

	test("stays open after a choice, so a sort and a grouping can both change", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Host onChange={onChange} />);
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("radio", { name: "Payee" }));
		await user.click(
			within(dialog).getByRole("radio", { name: "Largest first" }),
		);

		expect(screen.getByRole("dialog")).toBeVisible();
		expect(onChange).toHaveBeenLastCalledWith({
			sort: "amount",
			dir: "desc",
			group: "payee",
		});
		expect(trigger("Group and sort Payee · Largest first")).toBeInTheDocument();
	});

	test("the arrow keys move between choices and commit them", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Host onChange={onChange} />);
		const dialog = await open(user);
		within(dialog).getByRole("radio", { name: "Newest first" }).focus();

		await user.keyboard("{ArrowDown}");

		expect(onChange).toHaveBeenLastCalledWith({
			sort: "date",
			dir: "asc",
			group: "day",
		});
		expect(
			within(dialog).getByRole("radio", { name: "Oldest first" }),
		).toHaveFocus();
	});

	test("Escape closes it and focus goes back to the trigger", async () => {
		const { user } = renderMenu();
		await open(user);

		await user.keyboard("{Escape}");

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(trigger()).toHaveFocus());
	});
});
