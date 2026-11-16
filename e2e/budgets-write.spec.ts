import { type Page } from "@playwright/test";

import { shiftMonth } from "@/lib/budgets/months";
import { open, userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import {
	chooseOption,
	conflictView,
	currentMonth,
	dialog,
	expectNotice,
	group,
	limitBox,
	longMonth,
	monthName,
	overviewLine,
	panel,
	pickInGrid,
	row,
} from "./budgets";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

// Golden's Budgets: food 6,000.00 from 2026-09 and 5,000.00 from 2026-10; shopping 3,000.00,
// entertainment 1,000.00 from September; transportation 2,000.00 from October. Every write
// below is checked on September and October 2026, whose figures hold on any day (F04 section
// 5); the dialogs' own months start at the real current month (BR-F04-07), named dynamically.

const THIS = currentMonth();
const THIS_NAME = monthName(THIS);

/** Opens a dialog from the panel: selects the row, then presses the panel's button. */
async function openFromPanel(
	page: Page,
	key: string,
	button: string,
	title: string,
) {
	await row(page, key).click();
	await panel(page).getByRole("button", { name: button }).click();
	const opened = dialog(page, title);
	await expect(opened).toBeVisible();
	return opened;
}

// BR-F04-19, flow 7.1, BR-F04-29
test("Add a Budget for Health from a Not budgeted row, then Undo deletes it", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-09");
	await expect(page.getByText("Not budgeted · 3")).toBeVisible();
	await row(page, "unbudgeted:health")
		.getByRole("button", { name: "Add a Budget" })
		.click();
	const add = dialog(page, "Add a Budget");
	await expect(add.getByRole("radio", { name: /^Health/ })).toBeChecked();
	await limitBox(add).fill("1500");
	await add.getByRole("button", { name: `Add Budget from ${THIS_NAME}` }).click();
	await expect(add).toBeHidden();

	await expectNotice(
		page,
		`Health Budget added: ₹1,500.00 from ${longMonth(THIS)}.`,
	);
	// Docked, the new Budget is selected and its notice is in the panel.
	await expect(panel(page).getByRole("status")).toBeVisible();

	await panel(page).getByRole("button", { name: "Undo" }).click();
	await expect(page.getByRole("status")).toBeHidden();
	await expect(page.getByText("Not budgeted · 3")).toBeVisible();
});

// BR-F04-26, BR-F04-27, flow 7.2, AC-F04-03
test("Change Food to 7,000.00 from September: the preview, the notes, the new states, then Undo", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const change = await openFromPanel(
		page,
		"budget:food",
		"Change limit",
		"Change the Food limit",
	);
	await limitBox(change).fill("7000");
	await pickInGrid(page, "2026-09");
	await expect(change.getByRole("radio", { name: /^September/ })).toHaveAttribute(
		"aria-checked",
		"true",
	);

	const preview = change.getByRole("region", { name: "What changes" });
	await expect(preview).toContainText("84.2% Nearing limit → 72.1% · On track");
	await expect(preview).toContainText(
		"124.4% Over budget → 88.9% · Nearing limit",
	);
	await expect(preview).toContainText("every month after");
	await expect(change).toContainText("This also changes September");
	await expect(change).toContainText(
		"This replaces the change to ₹5,000.00 from October 2026.",
	);
	await change.getByRole("button", { name: "Change from September" }).click();
	await expect(change).toBeHidden();

	await expectNotice(page, "Food limit is now ₹7,000.00 from September 2026.");
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹7,000\.00 · 88\.9% · Nearing limit, ₹7,000\.00 from Sept 2026$/,
	);

	// Undo puts October back, and September as it was, 84.2% of 6,000.00 (a change of month
	// would end the notice).
	await panel(page).getByRole("button", { name: "Undo" }).click();
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹5,000\.00 · 124\.4% · Over budget, ₹5,000\.00 from Oct 2026$/,
	);
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹5,050\.00 of ₹6,000\.00 · 84\.2% · Nearing limit/,
	);
});

// BR-F04-24, AC-F04-14, section 5 "Raised for one month"
test("Food at 8,000.00 for October only: October moves, the source says so, the schedule stays", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const change = await openFromPanel(
		page,
		"budget:food",
		"Change limit",
		"Change the Food limit",
	);
	await limitBox(change).fill("8000");
	await chooseOption(change, "One month only");
	await change.getByRole("radio", { name: "October (viewing)" }).click();
	await expect(change).toContainText(
		"Only October 2026 changes. The limits for other months stay as they are.",
	);
	await change.getByRole("button", { name: "Change October only" }).click();
	await expect(change).toBeHidden();

	await expectNotice(page, "Food limit is ₹8,000.00 for October 2026 only.");
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹8,000\.00 · 77\.8% · On track, One-month limit for Oct 2026$/,
	);
	await expect(overviewLine(page)).toContainText("of ₹14,000.00 · 94.1%");
	await expect(
		panel(page).getByRole("region", { name: "Limit history" }),
	).toContainText("₹8,000.00 in Oct 2026 only");

	// September is untouched.
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹5,050\.00 of ₹6,000\.00 · 84\.2% · Nearing limit/,
	);
});

// BR-F04-21, AC-F04-15, section 5 "Removed for one month"
test("Stop Entertainment for October only: it is Not active there, and Undo puts it back", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const stop = await openFromPanel(
		page,
		"budget:entertainment",
		"Stop",
		"Stop budgeting Entertainment",
	);
	await chooseOption(stop, "One month only");
	await stop.getByRole("radio", { name: "October (viewing)" }).click();
	await stop.getByRole("button", { name: "Stop October only" }).click();
	await expect(stop).toBeHidden();

	await expectNotice(page, "Entertainment has no limit for October 2026 only.");
	await expect(overviewLine(page)).toContainText("of ₹10,000.00 · 110.2%");
	await expect(page.getByText("Not budgeted · 2")).toBeVisible();
	await group(page, /^Not active this month · 1/).click();
	await expect(row(page, "inactive:entertainment")).toContainText(
		"No limit for October 2026 only",
	);

	await panel(page).getByRole("button", { name: "Undo" }).click();
	await expect(row(page, "budget:entertainment")).toBeVisible();
	await expect(overviewLine(page)).toContainText("of ₹11,000.00 · 119.7%");
});

// BR-F04-04, BR-F04-21, AC-F04-04
test("Stop Entertainment from October: its months from then on have no Budget; September keeps it", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const stop = await openFromPanel(
		page,
		"budget:entertainment",
		"Stop",
		"Stop budgeting Entertainment",
	);
	await stop.getByRole("radio", { name: "October (viewing)" }).click();
	await expect(stop).toContainText("Earlier months keep their limits.");
	await expect(stop).toContainText("October's spending moves to Not budgeted.");
	await stop.getByRole("button", { name: "Stop from October" }).click();
	await expect(stop).toBeHidden();
	await expectNotice(
		page,
		"Entertainment Budget stops from October 2026. Earlier months keep their limits.",
	);
	await group(page, /^Not active this month · 1/).click();
	await expect(row(page, "inactive:entertainment")).toContainText(
		"Stopped from October 2026",
	);
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(row(page, "budget:entertainment")).toHaveAccessibleName(
		/₹649\.00 of ₹1,000\.00 · 64\.9% · On track/,
	);
});

// BR-F04-21: a stop that would remove every month offers Delete instead.
test("a stop from the first month turns into Delete Budget instead, which opens the confirmation", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const stop = await openFromPanel(
		page,
		"budget:food",
		"Stop",
		"Stop budgeting Food",
	);
	await pickInGrid(page, "2026-09");
	await expect(
		stop.getByText("This would remove every month. Delete the Budget instead."),
	).toBeVisible();
	await stop.getByRole("button", { name: "Delete Budget instead" }).click();
	const confirm = page.getByRole("alertdialog", {
		name: "Delete the Food Budget?",
	});
	await expect(confirm).toBeVisible();
	await expect(confirm).toContainText(
		"Its limit history (2 changes since September 2026) goes too. To keep it, stop the Budget from a month instead.",
	);
});

// BR-F04-06, flow 7.5, BR-F04-29
test("Delete Food: the notice is above the list, Food is Not budgeted, and Undo brings it back", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await panel(page).getByRole("button", { name: "Delete" }).click();
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Delete Budget" })
		.click();

	await expectNotice(page, "Food Budget deleted.");
	// After a delete the notice is above the list, never in the panel, and nothing is selected.
	await expect(panel(page).getByRole("status")).toBeHidden();
	await expect(panel(page)).toContainText("Compared with September");
	await expect(row(page, "unbudgeted:food")).toHaveAccessibleName(
		"Food, No limit in October, ₹6,220.00",
	);
	await expect(page.getByText("Needs attention · 3")).toBeVisible();

	await page.getByRole("button", { name: "Undo" }).click();
	await expect(page.getByRole("status")).toBeHidden();
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹5,000\.00 · 124\.4% · Over budget, ₹5,000\.00 from Oct 2026$/,
	);
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
});

// BR-F04-25, BR-F04-30: Remove in the limit history, then Undo.
test("Remove a one-month limit in the limit history, then Undo puts it back", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const change = await openFromPanel(
		page,
		"budget:food",
		"Change limit",
		"Change the Food limit",
	);
	await limitBox(change).fill("8000");
	await chooseOption(change, "One month only");
	await change.getByRole("radio", { name: "October (viewing)" }).click();
	await change.getByRole("button", { name: "Change October only" }).click();
	await expect(change).toBeHidden();
	await expectNotice(page, "Food limit is ₹8,000.00 for October 2026 only.");

	await panel(page)
		.getByRole("button", { name: "Remove ₹8,000.00 in Oct 2026 only" })
		.click();
	await expectNotice(page, "One-month limit for October 2026 removed.");
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹5,000\.00 · 124\.4% · Over budget, ₹5,000\.00 from Oct 2026$/,
	);

	await panel(page).getByRole("button", { name: "Undo" }).click();
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹8,000\.00 · 77\.8%/,
	);
});

// BR-F04-23, D-576, AC-F04-30: a second window changes Food while this dialog is open.
test("a save made on a Budget another window changed meets the conflict view, and Keep mine saves it", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const next = shiftMonth(THIS, 1);
	const mine = await openFromPanel(
		page,
		"budget:food",
		"Change limit",
		"Change the Food limit",
	);

	// The other window saves 5,500.00 from the current month first.
	const other = await context.newPage();
	await open(other, "/budgets?month=2026-10");
	await row(other, "budget:food").click();
	await panel(other).getByRole("button", { name: "Change limit" }).click();
	const theirs = dialog(other, "Change the Food limit");
	await limitBox(theirs).fill("5500");
	await theirs.getByRole("button", { name: `Change from ${THIS_NAME}` }).click();
	await expect(theirs).toBeHidden();
	await expectNotice(
		other,
		`Food limit is now ₹5,500.00 from ${longMonth(THIS)}.`,
	);

	await limitBox(mine).fill("7000");
	await mine.getByRole("radio", { name: /^Next month/ }).click();
	await mine
		.getByRole("button", { name: `Change from ${monthName(next)}` })
		.click();

	await expect(conflictView(page)).toBeVisible();
	await expect(conflictView(page)).toContainText(
		"Your version and the saved one are side by side, with the differences marked.",
	);
	await expect(conflictView(page).locator("[data-differs]")).not.toHaveCount(0);
	await expect(
		conflictView(page).getByText(
			`Keep mine applies your change, ₹7,000.00 from ${longMonth(next)}, to the saved Budget.`,
		),
	).toBeVisible();
	await expect(mine).toBeVisible();

	await conflictView(page).getByRole("button", { name: "Keep mine" }).click();
	await expect(conflictView(page)).toBeHidden();
	await expect(mine).toBeHidden();
	await expectNotice(page, `Food limit is now ₹7,000.00 from ${longMonth(next)}.`);
});

// BR-F04-23: Keep theirs sends nothing and shows the saved Budget.
test("Keep theirs closes the view and the dialog and shows the Budget as the other window saved it", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const mine = await openFromPanel(
		page,
		"budget:food",
		"Change limit",
		"Change the Food limit",
	);
	const other = await context.newPage();
	await open(other, "/budgets?month=2026-10");
	await row(other, "budget:food").click();
	await panel(other).getByRole("button", { name: "Change limit" }).click();
	const theirs = dialog(other, "Change the Food limit");
	await limitBox(theirs).fill("5500");
	await theirs.getByRole("button", { name: `Change from ${THIS_NAME}` }).click();
	await expect(theirs).toBeHidden();

	await limitBox(mine).fill("7000");
	await mine.getByRole("button", { name: `Change from ${THIS_NAME}` }).click();
	await expect(conflictView(page)).toBeVisible();
	await conflictView(page).getByRole("button", { name: "Keep theirs" }).click();
	await expect(conflictView(page)).toBeHidden();
	await expect(mine).toBeHidden();
	await expect(
		panel(page).getByRole("region", { name: "Limit history" }),
	).toContainText("₹5,500.00 from");
	await expect(page.getByRole("status")).toBeHidden();
});
