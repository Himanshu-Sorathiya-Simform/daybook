import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ENTRY_TEXT } from "../../lib/entry";
import { DiscardDialog } from "../DiscardDialog";

function setup(isOpen = true) {
	const handlers = { onOpenChange: vi.fn(), onDiscard: vi.fn() };
	render(
		<DiscardDialog
			isOpen={isOpen}
			{...handlers}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

describe("DiscardDialog (BR-F03-49)", () => {
	test("asks before throwing changes away", () => {
		setup();
		expect(
			screen.getByRole("alertdialog", { name: ENTRY_TEXT.discardTitle }),
		).toBeVisible();
		expect(screen.getByText(ENTRY_TEXT.discardBody)).toBeVisible();
	});

	test("Discard discards", async () => {
		const { user, onDiscard } = setup();
		await user.click(screen.getByRole("button", { name: "Discard" }));
		expect(onDiscard).toHaveBeenCalledOnce();
	});

	test("Keep editing goes back to the dialog", async () => {
		const { user, onDiscard, onOpenChange } = setup();
		await user.click(screen.getByRole("button", { name: "Keep editing" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onDiscard).not.toHaveBeenCalled();
	});

	test("closed, it shows nothing", () => {
		setup(false);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});
});
