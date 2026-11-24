import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import { CONFLICT_TEXT } from "../../lib/conflict";
import type { Formats } from "../../lib/labels";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import { DialogConflict, type DialogConflictProps } from "../DialogConflict";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

function setup(props: Partial<DialogConflictProps> = {}) {
	const handlers = {
		onClose: vi.fn(),
		onKeepMine: vi.fn(),
		onKeepTheirs: vi.fn(),
	};
	render(
		<DialogConflict
			yours={goldenBudget("food")}
			current={budgetAnswer("food", {
				version: 3,
				schedule: [{ from: "2026-01", limitMinor: 900000 }],
				overrides: [],
			})}
			formats={IN}
			isPending={false}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

describe("DialogConflict (BR-F04-23, D-567)", () => {
	test("shows the user's version beside the one saved now, a row per month", () => {
		setup();
		const dialog = screen.getByRole("dialog", { name: CONFLICT_TEXT.title });
		expect(within(dialog).getByText(CONFLICT_TEXT.mine)).toBeVisible();
		expect(within(dialog).getByText(CONFLICT_TEXT.theirs)).toBeVisible();
		expect(within(dialog).getAllByRole("row").length).toBeGreaterThan(1);
	});

	test("says what Keep mine does", () => {
		setup({ keepMineLine: CONFLICT_TEXT.undoLine });
		expect(screen.getByText(CONFLICT_TEXT.undoLine)).toBeVisible();
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

	test("a delete's view offers Delete anyway and Keep it", async () => {
		const { user, onKeepMine, onKeepTheirs } = setup({ isDelete: true });
		expect(screen.getByText(CONFLICT_TEXT.deleteIntro)).toBeVisible();
		await user.click(
			screen.getByRole("button", { name: CONFLICT_TEXT.deleteAnyway }),
		);
		await user.click(screen.getByRole("button", { name: CONFLICT_TEXT.keepIt }));
		expect(onKeepMine).toHaveBeenCalledOnce();
		expect(onKeepTheirs).toHaveBeenCalledOnce();
	});

	test("closing without a choice goes back to where the write started", async () => {
		const { user, onClose, onKeepMine, onKeepTheirs } = setup();
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
		expect(onKeepMine).not.toHaveBeenCalled();
		expect(onKeepTheirs).not.toHaveBeenCalled();
	});

	test("while Keep mine's resend runs, closing waits", async () => {
		const { user, onClose } = setup({ isPending: true });
		await user.keyboard("{Escape}");
		expect(onClose).not.toHaveBeenCalled();
	});
});
