import { onlineManager } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { ok, route } from "../../hooks/__tests__/helpers";
import {
	budgetAnswer,
	historyAnswer,
	monthAnswer,
} from "../../lib/__tests__/fixtures";
import type { BudgetsLocale } from "../../lib/types";
import {
	BudgetDialogs,
	type BudgetDialogsProps,
	type OpenDialog,
} from "../BudgetDialogs";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const IN: BudgetsLocale = {
	today: "2026-11-02",
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

const FOOD = goldenBudget("food");

const NO_CONFLICT: BudgetDialogsProps["notices"] = {
	conflict: null,
	isUndoing: false,
	isRemoving: false,
	closeConflict: vi.fn(),
	keepMine: vi.fn(),
	keepTheirs: vi.fn(),
};

function setup(
	dialog: OpenDialog | null,
	{
		data = monthAnswer("2026-10"),
		notices = NO_CONFLICT,
	}: {
		/** The month shown, or `null` while it has not loaded. */
		data?: BudgetDialogsProps["data"] | null;
		notices?: BudgetDialogsProps["notices"];
	} = {},
) {
	// The limit's hint reads the category's last two months.
	route(network, "get", "/api/budgets/history", ({ path }) => {
		const query = new URL(path, "http://x").searchParams;
		return ok(
			historyAnswer(
				query.get("category") as ExpenseCategory,
				query.get("to") as Month,
				Number(query.get("months")),
			),
		);
	});
	return renderInApp(
		<BudgetDialogs
			dialog={dialog}
			isOpen
			data={data ?? undefined}
			locale={IN}
			onClose={vi.fn()}
			onDeleted={vi.fn()}
			onSaved={vi.fn()}
			onDeleteInstead={vi.fn()}
			notices={notices}
		/>,
	);
}

describe("the dialog the page has open (BR-F04-19 to BR-F04-21, BR-F04-06)", () => {
	test("none open shows nothing", () => {
		setup(null);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	test.each([
		["add", null, "Add a Budget"],
		["change", "food", "Change the Food limit"],
		["stop", "food", "Stop budgeting Food"],
	] as const)("%s opens the Budget dialog", async (kind, category, title) => {
		setup({ kind, category, opened: 1 });
		expect(
			await screen.findByRole("dialog", {
				name: new RegExp(title.split(" ")[0]!),
			}),
		).toBeVisible();
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
	});

	test("Delete opens its confirmation for its Budget", async () => {
		setup({ kind: "delete", record: FOOD, opened: 1 });
		expect(
			await screen.findByRole("alertdialog", {
				name: /Delete the Food Budget/,
			}),
		).toBeVisible();
	});

	test("a Budget dialog waits for the month to load", () => {
		setup({ kind: "add", category: null, opened: 1 }, { data: null });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("a conflict opens its view beside no dialog", async () => {
		setup(null, {
			notices: {
				...NO_CONFLICT,
				conflict: {
					current: budgetAnswer("food", { version: 3 }),
					yours: FOOD,
					line: "Keep mine puts it back.",
					isDelete: false,
				},
			},
		});
		expect(await screen.findByRole("dialog")).toBeVisible();
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		expect(screen.getByText("Keep mine puts it back.")).toBeVisible();
	});
});
