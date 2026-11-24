import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { row } from "../../lib/__tests__/fixtures";
import { CONFLICT_TEXT, keepMineLine } from "../../lib/conflict";
import type { EntryLocale, EntryValues } from "../../lib/entry";
import { EntryConflictDialog } from "../EntryConflictDialog";

const LOCALE: EntryLocale = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

const VALUES: EntryValues = {
	type: "expense",
	amount: "700",
	payee: "Swiggy",
	category: "food",
	date: "2026-10-19",
	time: "16:45",
	description: "",
	note: "",
};

function setup() {
	const editing = row();
	const handlers = {
		onClose: vi.fn(),
		onKeepMine: vi.fn(),
		onKeepTheirs: vi.fn(),
	};
	render(
		<EntryConflictDialog
			editing={editing}
			conflict={{
				current: row({ amountMinor: 99900, version: 2 }),
				change: { amountMinor: 70000, currency: "INR" },
			}}
			values={VALUES}
			start={VALUES}
			locale={LOCALE}
			today="2026-11-02"
			isPending={false}
			{...handlers}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

describe("EntryConflictDialog (BR-F03-24, BR-F03-78)", () => {
	test("shows the user's change beside the row as it is saved now", () => {
		setup();
		expect(screen.getByRole("dialog")).toBeVisible();
		expect(screen.getByText(CONFLICT_TEXT.mine)).toBeVisible();
		expect(screen.getByText(CONFLICT_TEXT.theirs)).toBeVisible();
	});

	test("says what Keep mine does", () => {
		setup();
		expect(screen.getByText(keepMineLine(["amount"]))).toBeVisible();
	});

	test("Keep mine and Keep theirs report their choice", async () => {
		const { user, onKeepMine, onKeepTheirs } = setup();
		await user.click(
			screen.getByRole("button", { name: CONFLICT_TEXT.keepMine }),
		);
		expect(onKeepMine).toHaveBeenCalledOnce();
		await user.click(
			screen.getByRole("button", { name: CONFLICT_TEXT.keepTheirs }),
		);
		expect(onKeepTheirs).toHaveBeenCalledOnce();
	});

	test("closing without a choice goes back to the dialog", async () => {
		const { user, onClose } = setup();
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});
});
