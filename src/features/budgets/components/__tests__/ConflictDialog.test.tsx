import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import { conflictRows } from "../../lib/conflict";
import type { Formats } from "../../lib/labels";
import { ConflictDialog, type ConflictDialogProps } from "../ConflictDialog";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const FOOD = goldenBudget("food");
const ROWS = conflictRows(
	{
		...FOOD,
		schedule: [...FOOD.schedule, { from: "2026-12", limitMinor: 700000 }],
	},
	{
		...FOOD,
		schedule: [...FOOD.schedule, { from: "2026-11", limitMinor: 550000 }],
	},
	IN,
);

function renderConflict(props: Partial<ConflictDialogProps> = {}) {
	const handlers = {
		onOpenChange: vi.fn(),
		onKeepMine: vi.fn(),
		onKeepTheirs: vi.fn(),
	};
	const view = render(
		<ConflictDialog
			isOpen
			rows={ROWS}
			keepMineLine="Keep mine applies your change, ₹7,000.00 from December 2026, to the saved Budget."
			{...handlers}
			{...props}
		/>,
	);
	return { ...view, ...handlers, user: userEvent.setup() };
}

const row = (name: RegExp) =>
	screen.getAllByRole("row").find((each) => name.test(each.textContent ?? ""))!;

describe("ConflictDialog (BR-F04-23, D-567)", () => {
	test("is titled This Budget changed on another device, with its intro", () => {
		renderConflict();
		expect(screen.getByRole("dialog")).toHaveAccessibleName(
			"This Budget changed on another device",
		);
		expect(
			screen.getByText(
				"Your version and the saved one are side by side, with the differences marked.",
			),
		).toBeVisible();
	});

	test("has Month, Yours and Saved now as its columns", () => {
		renderConflict();
		expect(
			screen.getAllByRole("columnheader").map((each) => each.textContent),
		).toEqual(["Month", "Yours", "Saved now"]);
	});

	// AC-F04-30
	test("a row per month, newest first, with each side worded", () => {
		renderConflict();
		const body = screen.getAllByRole("row").slice(1);
		expect(body).toHaveLength(4);
		expect(within(body[0]!).getByRole("rowheader")).toHaveTextContent(
			"Dec 2026",
		);
		expect(within(row(/Dec 2026/)).getAllByRole("cell")[0]).toHaveTextContent(
			"₹7,000.00 from Dec 2026",
		);
		expect(within(row(/Dec 2026/)).getAllByRole("cell")[1]).toHaveTextContent(
			"None",
		);
		expect(within(row(/Nov 2026/)).getAllByRole("cell")[1]).toHaveTextContent(
			"₹5,500.00 from Nov 2026",
		);
	});

	test("a row that differs is tinted and marked Differs, one that does not is neither", () => {
		renderConflict();
		for (const month of [/Dec 2026/, /Nov 2026/]) {
			expect(row(month)).toHaveAttribute("data-differs", "true");
			expect(row(month)).toHaveClass("bg-accent-soft");
			expect(within(row(month)).getByText("Differs")).toBeVisible();
		}
		for (const month of [/Oct 2026/, /Sept 2026/]) {
			expect(row(month)).not.toHaveAttribute("data-differs");
			expect(row(month)).not.toHaveClass("bg-accent-soft");
			expect(
				within(row(month)).queryByText("Differs"),
			).not.toBeInTheDocument();
		}
	});

	test("a month holding both kinds shows one item per line", () => {
		renderConflict({
			rows: conflictRows(
				{
					schedule: FOOD.schedule,
					overrides: [{ month: "2026-10", limitMinor: 800000 }],
				},
				FOOD,
				IN,
			),
		});
		const cell = within(row(/Oct 2026/)).getAllByRole("cell")[0]!;
		expect(cell).toHaveClass("whitespace-pre-line");
		expect(cell.textContent).toBe(
			"₹8,000.00 in Oct 2026 only\n₹5,000.00 from Oct 2026",
		);
	});

	test("names what Keep mine saves under the table", () => {
		renderConflict();
		expect(
			screen.getByText(
				"Keep mine applies your change, ₹7,000.00 from December 2026, to the saved Budget.",
			),
		).toBeVisible();
	});

	test("has no such line for a delete, or when none is given", () => {
		renderConflict({ isDelete: true, keepMineLine: undefined as never });
		expect(screen.queryByText(/^Keep mine/)).not.toBeInTheDocument();
	});

	test("Keep mine and Keep theirs call their handlers", async () => {
		const { user, onKeepMine, onKeepTheirs } = renderConflict();
		await user.click(screen.getByRole("button", { name: "Keep theirs" }));
		expect(onKeepTheirs).toHaveBeenCalledOnce();
		expect(onKeepMine).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Keep mine" }));
		expect(onKeepMine).toHaveBeenCalledOnce();
	});

	test("for a delete, the choices read Delete anyway and Keep it, with a delete's intro", async () => {
		const { user, onKeepMine, onKeepTheirs } = renderConflict({
			isDelete: true,
		});
		expect(
			screen.getByText(
				"It changed after you chose to delete it. Delete it anyway, or keep it as it is saved now.",
			),
		).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Keep mine" }),
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Keep it" }));
		expect(onKeepTheirs).toHaveBeenCalledOnce();
		await user.click(screen.getByRole("button", { name: "Delete anyway" }));
		expect(onKeepMine).toHaveBeenCalledOnce();
	});

	test("Escape and Close report closing without a choice", async () => {
		const { user, onOpenChange } = renderConflict();
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledWith(false);
		onOpenChange.mockClear();
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test("while Keep mine is sent, both choices wait and closing does nothing", async () => {
		const { user, onOpenChange, onKeepTheirs } = renderConflict({
			isPending: true,
		});
		expect(screen.getByRole("button", { name: "Keep theirs" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await user.click(screen.getByRole("button", { name: "Keep theirs" }));
		expect(onKeepTheirs).not.toHaveBeenCalled();
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	test("renders nothing while closed", () => {
		renderConflict({ isOpen: false });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	test("takes a className on its panel", () => {
		renderConflict({ className: "extra" });
		expect(screen.getByRole("dialog").parentElement).toHaveClass("extra");
	});
});
