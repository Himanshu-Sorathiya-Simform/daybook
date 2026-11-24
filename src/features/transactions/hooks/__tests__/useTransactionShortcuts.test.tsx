import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
	type TransactionShortcutsOptions,
	useTransactionShortcuts,
} from "../useTransactionShortcuts";

function Page(props: TransactionShortcutsOptions) {
	useTransactionShortcuts(props);
	return <input aria-label="Search" />;
}

function setup(options: Partial<TransactionShortcutsOptions> = {}) {
	const handlers = {
		onEdit: vi.fn(),
		onDuplicate: vi.fn(),
		onRemove: vi.fn(),
		onClear: vi.fn(),
	};
	render(
		<Page
			actionable
			canClear
			{...handlers}
			{...options}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

describe("useTransactionShortcuts (BR-F03-73)", () => {
	test("E edits the selected row", async () => {
		const { user, onEdit } = setup();
		await user.keyboard("e");
		expect(onEdit).toHaveBeenCalledOnce();
	});

	test("D duplicates it", async () => {
		const { user, onDuplicate } = setup();
		await user.keyboard("d");
		expect(onDuplicate).toHaveBeenCalledOnce();
	});

	test.each(["{Delete}", "{Backspace}"])("%s deletes it", async (key) => {
		const { user, onRemove } = setup();
		await user.keyboard(key);
		expect(onRemove).toHaveBeenCalledOnce();
	});

	test("Escape clears the selection", async () => {
		const { user, onClear } = setup();
		await user.keyboard("{Escape}");
		expect(onClear).toHaveBeenCalledOnce();
	});

	test("while the selection is not actionable E, D and Delete rest", async () => {
		const { user, onEdit, onDuplicate, onRemove, onClear } = setup({
			actionable: false,
		});
		await user.keyboard("ed{Delete}{Backspace}");
		expect(onEdit).not.toHaveBeenCalled();
		expect(onDuplicate).not.toHaveBeenCalled();
		expect(onRemove).not.toHaveBeenCalled();
		await user.keyboard("{Escape}");
		expect(onClear).toHaveBeenCalledOnce();
	});

	test("with a dialog open over the page Escape rests", async () => {
		const { user, onClear } = setup({ canClear: false });
		await user.keyboard("{Escape}");
		expect(onClear).not.toHaveBeenCalled();
	});

	test("typing in a text field is typing, not a shortcut", async () => {
		const { user, onEdit, onDuplicate, onClear } = setup();
		await user.click(screen.getByRole("textbox", { name: "Search" }));
		await user.keyboard("ed{Escape}");
		expect(onEdit).not.toHaveBeenCalled();
		expect(onDuplicate).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
	});
});
