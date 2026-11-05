import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { conflictRows, keepMineLine } from "../../lib/conflict";
import type { LabelLocale } from "../../lib/labels";
import { row } from "../../lib/__tests__/fixtures";
import { ConflictDialog, type ConflictDialogProps } from "../ConflictDialog";

// The golden profile (IN, INR) on the golden clock's day (TST-3).
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

// Flow 7.4 on golden #21: device A raised the amount, B changed the description.
const BEFORE = row({
	amountMinor: 290000,
	payee: "BigBasket",
	description: "Monthly groceries",
});
const ROWS = conflictRows(
	BEFORE,
	{ description: "October groceries" },
	{ ...BEFORE, amountMinor: 310000, version: 2 },
	IN,
);

function renderConflict(props: Partial<ConflictDialogProps> = {}) {
	const handlers = {
		onOpenChange: vi.fn(),
		onKeepMine: vi.fn(),
		onKeepTheirs: vi.fn(),
	};
	render(
		<ConflictDialog
			isOpen
			rows={ROWS}
			keepMineLine={keepMineLine(["description"])}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

const dialog = () =>
	screen.getByRole("dialog", {
		name: "This Transaction changed on another device",
	});

describe("ConflictDialog (BR-F03-24, BR-F03-78)", () => {
	// AC-F03-19
	test("shows both versions side by side under Field, Yours and Saved now", () => {
		renderConflict();

		const table = within(dialog()).getByRole("table");
		expect(
			within(table)
				.getAllByRole("columnheader")
				.map((each) => each.textContent),
		).toEqual(["Field", "Yours", "Saved now"]);
		const rows = within(table).getAllByRole("row").slice(1);
		expect(rows).toHaveLength(8);
		expect(
			within(rows[1]!)
				.getAllByRole("cell")
				.map((each) => each.textContent),
		).toEqual(["₹2,900.00", "₹3,100.00"]);
	});

	test("marks each difference with the word Differs, not colour alone", () => {
		renderConflict();

		const marked = within(dialog())
			.getAllByRole("rowheader")
			.filter((header) => header.textContent?.includes("Differs"))
			.map((header) => header.textContent);
		expect(marked).toEqual(["AmountDiffers", "DescriptionDiffers"]);
		const amount = within(dialog()).getByRole("rowheader", { name: /^Amount/ });
		expect(amount.closest("tr")).toHaveAttribute("data-differs", "true");
		const type = within(dialog()).getByRole("rowheader", { name: "Type" });
		expect(type.closest("tr")).not.toHaveAttribute("data-differs");
	});

	test("says what Keep mine saves", () => {
		renderConflict();

		expect(
			within(dialog()).getByText(
				"Keep mine saves your change to Description and keeps the rest as it is saved now.",
			),
		).toBeInTheDocument();
		expect(
			within(dialog()).getByText(
				"Your version and the saved one are side by side, with the differences marked.",
			),
		).toBeInTheDocument();
	});

	test("Keep mine and Keep theirs each call their handler", async () => {
		const { user, onKeepMine, onKeepTheirs } = renderConflict();

		await user.click(screen.getByRole("button", { name: "Keep theirs" }));
		await user.click(screen.getByRole("button", { name: "Keep mine" }));

		expect(onKeepTheirs).toHaveBeenCalledOnce();
		expect(onKeepMine).toHaveBeenCalledOnce();
	});

	test("Escape and Close go back without a choice", async () => {
		const { user, onOpenChange, onKeepMine, onKeepTheirs } = renderConflict();

		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onOpenChange.mock.calls).toEqual([[false], [false]]);
		expect(onKeepMine).not.toHaveBeenCalled();
		expect(onKeepTheirs).not.toHaveBeenCalled();
	});

	test("while Keep mine runs, nothing else can be chosen and it can't close", async () => {
		const { user, onOpenChange, onKeepTheirs } = renderConflict({
			isPending: true,
		});

		expect(screen.getByRole("button", { name: /Keep mine/ })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(screen.getByRole("button", { name: "Keep theirs" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await user.click(screen.getByRole("button", { name: "Keep theirs" }));
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onKeepTheirs).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	test("a closed view shows nothing", () => {
		renderConflict({ isOpen: false });

		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
