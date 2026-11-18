import { tabTo } from "./keyboard";
import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import {
	currentMonth,
	dialog,
	expectNotice,
	limitBox,
	longMonth,
	panel,
	row,
} from "./budgets";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

const selected = (page: Parameters<typeof row>[0], key: string) =>
	expect(row(page, key)).toHaveAttribute("aria-selected", "true");

// BR-F04-17, BR-F04-32, D-571: Up and Down select and the docked panel follows; Escape clears.
test("Up and Down select the rows and the panel follows; Escape clears the selection", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await selected(page, "budget:food");
	await expect(panel(page)).toContainText("Food");

	await page.keyboard.press("ArrowDown");
	await selected(page, "budget:shopping");
	await expect(panel(page)).toContainText("Shopping");
	await expect(panel(page)).toContainText("100.0% · ₹0.00 left · At limit");

	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowUp");
	await selected(page, "budget:entertainment");
	await expect(panel(page)).toContainText("214.8%");

	// Past the last Budget the Not budgeted row is next.
	for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowDown");
	await selected(page, "unbudgeted:housing");
	await expect(panel(page)).toContainText("₹18,000.00 spent in October, no limit");

	await page.keyboard.press("Escape");
	await expect(row(page, "unbudgeted:housing")).toHaveAttribute(
		"aria-selected",
		"false",
	);
	await expect(panel(page)).toContainText("Compared with September");
});

// BR-F04-32, D-573: L, S, Delete and Backspace act as the panel's buttons do.
test("L, S and Delete open their dialogs for the selection, and Escape closes each", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await expect(panel(page)).toContainText(
		"L to change limit · S to stop · Delete to delete",
	);

	await page.keyboard.press("l");
	const change = dialog(page, "Change the Food limit");
	await expect(change).toBeVisible();
	// Focus starts in the limit.
	await expect(limitBox(change)).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(change).toBeHidden();

	await page.keyboard.press("s");
	const stop = dialog(page, "Stop budgeting Food");
	await expect(stop).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(stop).toBeHidden();

	await page.keyboard.press("Delete");
	const confirm = page.getByRole("alertdialog", {
		name: "Delete the Food Budget?",
	});
	await expect(confirm).toBeVisible();
	// Focus starts on Cancel, so Enter never deletes by accident.
	await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(confirm).toBeHidden();

	await page.keyboard.press("Backspace");
	await expect(
		page.getByRole("alertdialog", { name: "Delete the Food Budget?" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await selected(page, "budget:food");
});

// BR-F04-32, D-573: a Not budgeted row has no S and no Delete; its panel names only the keys it has.
test("a Not budgeted row takes no S or Delete, and its hint names none", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "unbudgeted:housing").click();
	await expect(panel(page)).toContainText("Up and down arrows move");
	await expect(panel(page)).not.toContainText("S to stop");
	await page.keyboard.press("s");
	await page.keyboard.press("l");
	await page.keyboard.press("Delete");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

// D-572: keys rest while a dialog is open; Enter in the limit saves; Undo is reachable by Tab.
test("a change made wholly from the keyboard: L, the limit, Enter, then Tab to Undo", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await page.keyboard.press("l");
	const change = dialog(page, "Change the Food limit");
	await expect(limitBox(change)).toBeFocused();
	await page.keyboard.press("Control+a");
	await page.keyboard.type("7000");
	// The page's S and arrows do nothing behind a dialog.
	await expect(dialog(page, "Stop budgeting Food")).toBeHidden();
	await page.keyboard.press("Enter");
	await expect(change).toBeHidden();
	await expectNotice(
		page,
		`Food limit is now ₹7,000.00 from ${longMonth(currentMonth())}.`,
	);

	await tabTo(page, panel(page).getByRole("button", { name: "Undo" }), 60);
	await page.keyboard.press("Enter");
	await expect(page.getByRole("status")).toBeHidden();
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹5,000\.00 · 124\.4% · Over budget/,
	);
});

// D-572: Escape in the month grid closes the grid alone and focus returns to the chosen chip.
test("Escape in the Other month grid closes the grid, not the dialog", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await page.keyboard.press("l");
	const change = dialog(page, "Change the Food limit");
	// The month chips are one tab stop; the arrows move along them to Other month.
	await tabTo(page, change.getByRole("radio", { name: /^This month/ }), 20);
	const other = change.getByRole("radio", { name: "Other month" });
	for (let step = 0; step < 5; step++) {
		if (await other.evaluate((chip) => chip === document.activeElement)) break;
		await page.keyboard.press("ArrowRight");
	}
	await expect(other).toBeFocused();
	await page.keyboard.press("Enter");
	const grid = page.getByRole("dialog", { name: "Other month" });
	await expect(grid).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(grid).toBeHidden();
	await expect(change).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(change).toBeHidden();
});

// BR-F04-14: the month control works from the keyboard.
test("the month grid opens from the keyboard, moves with the arrows and picks with Enter", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await tabTo(page, page.getByRole("button", { name: "October 2026" }), 30);
	await page.keyboard.press("Enter");
	await expect(page.getByRole("option", { name: /^October 2026/ })).toBeVisible();
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/budgets\?month=2026-09$/);
	await expect(page.getByText("Needs attention · 2")).toBeVisible();
});
