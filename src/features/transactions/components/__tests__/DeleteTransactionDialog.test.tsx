import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { row } from "../../lib/__tests__/fixtures";
import { TRANSACTIONS_TEXT } from "../../lib/messages";
import { DeleteTransactionDialog } from "../DeleteTransactionDialog";

const LOCALE = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	today: "2026-11-02",
} as const;

function setup() {
	const handlers = { onClose: vi.fn(), onConfirm: vi.fn() };
	render(
		<DeleteTransactionDialog
			row={row()}
			locale={LOCALE}
			{...handlers}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

describe("DeleteTransactionDialog (BR-F03-26, D-84)", () => {
	test("asks, shows the row as the list does, and says what a delete does", () => {
		setup();
		expect(
			screen.getByRole("alertdialog", { name: TRANSACTIONS_TEXT.deleteTitle }),
		).toBeVisible();
		expect(screen.getByText("Swiggy")).toBeVisible();
		expect(screen.getByText(TRANSACTIONS_TEXT.deleteBody)).toBeVisible();
	});

	test("Delete confirms", async () => {
		const { user, onConfirm, onClose } = setup();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("Cancel keeps the row", async () => {
		const { user, onConfirm, onClose } = setup();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onClose).toHaveBeenCalledOnce();
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
