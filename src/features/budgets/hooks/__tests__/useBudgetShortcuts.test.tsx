import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
	type BudgetShortcutsOptions,
	useBudgetShortcuts,
} from "../useBudgetShortcuts";

const ALL = { changeLimit: true, stop: true, remove: true };
const NONE = { changeLimit: false, stop: false, remove: false };

function Page(props: BudgetShortcutsOptions) {
	useBudgetShortcuts(props);
	return <input aria-label="Search" />;
}

function setup(options: Partial<BudgetShortcutsOptions> = {}) {
	const handlers = {
		onChangeLimit: vi.fn(),
		onStop: vi.fn(),
		onDelete: vi.fn(),
		onClear: vi.fn(),
	};
	render(
		<Page
			selected="food"
			keys={ALL}
			{...handlers}
			{...options}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

describe("useBudgetShortcuts (BR-F04-32, D-573)", () => {
	test("L changes the limit of the selection", async () => {
		const { user, onChangeLimit } = setup();
		await user.keyboard("l");
		expect(onChangeLimit).toHaveBeenCalledExactlyOnceWith("food");
	});

	test("S stops budgeting for the selection", async () => {
		const { user, onStop } = setup();
		await user.keyboard("s");
		expect(onStop).toHaveBeenCalledExactlyOnceWith("food");
	});

	test.each(["{Delete}", "{Backspace}"])(
		"%s deletes the selection",
		async (key) => {
			const { user, onDelete } = setup();
			await user.keyboard(key);
			expect(onDelete).toHaveBeenCalledExactlyOnceWith("food");
		},
	);

	test("Escape clears the selection", async () => {
		const { user, onClear } = setup();
		await user.keyboard("{Escape}");
		expect(onClear).toHaveBeenCalledOnce();
	});

	test("a key the selection's buttons do not offer does nothing", async () => {
		const { user, onChangeLimit, onStop, onDelete } = setup({
			keys: { changeLimit: false, stop: true, remove: false },
		});
		await user.keyboard("l{Delete}{Backspace}");
		expect(onChangeLimit).not.toHaveBeenCalled();
		expect(onDelete).not.toHaveBeenCalled();
		await user.keyboard("s");
		expect(onStop).toHaveBeenCalledOnce();
	});

	test("with nothing selected no key acts", async () => {
		const handlers = setup({ selected: null, keys: NONE });
		await handlers.user.keyboard("ls{Delete}{Escape}");
		expect(handlers.onChangeLimit).not.toHaveBeenCalled();
		expect(handlers.onStop).not.toHaveBeenCalled();
		expect(handlers.onDelete).not.toHaveBeenCalled();
		expect(handlers.onClear).not.toHaveBeenCalled();
	});

	test("typing in a text field is typing, not a shortcut", async () => {
		const handlers = setup();
		await handlers.user.click(screen.getByRole("textbox", { name: "Search" }));
		await handlers.user.keyboard("ls{Escape}");
		expect(handlers.onChangeLimit).not.toHaveBeenCalled();
		expect(handlers.onStop).not.toHaveBeenCalled();
		expect(handlers.onClear).not.toHaveBeenCalled();
	});
});
