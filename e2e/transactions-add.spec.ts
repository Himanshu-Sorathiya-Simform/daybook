import { type Page } from "@playwright/test";

import { open, userWithGolden, userWithProfile } from "./data";
import { expect, test } from "./fixtures";
import { choose, expectHeader, list, rows, searchBox } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

const entry = (page: Page) => page.getByRole("dialog", { name: "New Transaction" });

/** Fills an expense: the amount, a new payee, and a category tile. */
async function fillExpense(page: Page, amount: string, payee: string) {
	const dialog = entry(page);
	await dialog.getByRole("textbox", { name: "Amount" }).fill(amount);
	const payeeBox = dialog.getByRole("combobox", { name: "Payee" });
	await payeeBox.fill(payee);
	await payeeBox.press("Escape");
	await choose(dialog, "radio", "Food");
}

// BR-F03-21, AC-F03-62, AC-F03-70
test("the header's Add Transaction saves an expense, selects it and updates the header", async ({
	page,
}) => {
	await userWithProfile(page);
	await expect(page.getByText("No Transactions yet.")).toBeVisible();

	await page
		.getByRole("banner")
		.getByRole("button", { name: "Add Transaction" })
		.click();
	await expect(entry(page)).toBeVisible();
	await expect(entry(page).getByText(/to save$/)).toBeVisible();
	await fillExpense(page, "250", "Chai Point");
	await entry(page).getByRole("button", { name: "Save", exact: true }).click();

	await expect(page.getByText("Transaction saved.")).toBeVisible();
	await expect(entry(page)).toBeHidden();
	await expect(rows(page)).toHaveCount(1);
	await expect(rows(page).first()).toHaveAccessibleName(
		/^Chai Point, Food, .*, −₹250\.00$/,
	);
	await expect(page).toHaveURL(/\?txn=[0-9a-f-]{36}$/);
	await expectHeader(page, { count: 1, inText: "₹0.00", out: "₹250.00" });
});

// AC-F03-70, D-548
test("N on another page opens the dialog, and its Save says Transaction saved.", async ({
	page,
}) => {
	await userWithProfile(page);
	await open(page, "/budgets");
	await page.locator("body").click({ position: { x: 5, y: 300 } });
	await page.keyboard.press("n");

	await expect(entry(page)).toBeVisible();
	await fillExpense(page, "99", "Kirana");
	await entry(page).getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByText("Transaction saved.")).toBeVisible();
	await expect(page).toHaveURL(/\/budgets$/);
});

// AC-F03-70, BR-F03-21
test("Save and add another keeps Expense, empties the rest and focuses Amount", async ({
	page,
}) => {
	await userWithProfile(page);
	await page.keyboard.press("n");
	await fillExpense(page, "120", "Chai Point");
	await entry(page).getByRole("button", { name: "Save and add another" }).click();

	await expect(page.getByText("Transaction saved.")).toBeVisible();
	await expect(entry(page)).toBeVisible();
	const amount = entry(page).getByRole("textbox", { name: "Amount" });
	await expect(amount).toHaveValue("");
	await expect(amount).toBeFocused();
	await expect(entry(page).getByRole("combobox", { name: "Payee" })).toHaveValue(
		"",
	);
	await expect(entry(page).getByRole("radio", { name: "Expense" })).toBeChecked();
	await expect(rows(page)).toHaveCount(1);
});

// AC-F03-70, BR-F03-22
test("a row the filter hides says so, and Show clears the filters", async ({
	page,
}) => {
	await userWithGolden(page, "/transactions?type=income");
	await expect(rows(page)).toHaveCount(3);
	await page
		.getByRole("banner")
		.getByRole("button", { name: "Add Transaction" })
		.click();
	await fillExpense(page, "75", "Chai Point");
	await entry(page).getByRole("button", { name: "Save", exact: true }).click();

	await expect(
		page.getByText("Saved. It's hidden by your filters."),
	).toBeVisible();
	await expect(page).not.toHaveURL(/txn=/);
	await page.getByRole("button", { name: "Show" }).click();
	await expect(page).toHaveURL(/\/transactions$/);
	await expect(rows(page)).toHaveCount(23);
});

// BR-F03-48, BR-F03-49
test("Save with nothing filled marks each field, with focus on Amount", async ({
	page,
}) => {
	await userWithProfile(page);
	await page.keyboard.press("n");
	await entry(page).getByRole("button", { name: "Save", exact: true }).click();

	await expect(entry(page).getByText("Enter an amount.")).toBeVisible();
	await expect(
		entry(page).getByText("Enter who you paid, or who paid you."),
	).toBeVisible();
	await expect(entry(page).getByText("Choose a category.")).toBeVisible();
	await expect(entry(page).getByRole("textbox", { name: "Amount" })).toBeFocused();
});

// BR-F03-49
test("Escape after a change asks first; Keep editing keeps what was typed", async ({
	page,
}) => {
	await userWithProfile(page);
	await page.keyboard.press("n");
	await entry(page).getByRole("textbox", { name: "Amount" }).fill("640");
	await page.keyboard.press("Escape");

	const discard = page.getByRole("alertdialog", { name: "Discard changes?" });
	await expect(discard).toContainText("What you've typed here won't be saved.");
	await discard.getByRole("button", { name: "Keep editing" }).click();
	await expect(entry(page).getByRole("textbox", { name: "Amount" })).toHaveValue(
		"640.00",
	);
	// The confirm closes and gives focus back first; an Escape before that goes to it.
	await expect(discard).toBeHidden();
	await expect(entry(page).getByRole("textbox", { name: "Amount" })).toBeFocused();
	await page.keyboard.press("Escape");
	await page
		.getByRole("alertdialog", { name: "Discard changes?" })
		.getByRole("button", { name: "Discard" })
		.click();
	await expect(entry(page)).toBeHidden();
});

// BR-F03-52: N in a text field types the letter.
test("N in the search box types, and opens nothing", async ({ page }) => {
	await userWithGolden(page);
	await searchBox(page).click();
	await page.keyboard.press("n");
	await expect(searchBox(page)).toHaveValue("n");
	await expect(entry(page)).toHaveCount(0);
});

test.describe("on a phone (AC-F03-62)", () => {
	test.use({ viewport: { width: 375, height: 740 } });

	test("the bottom bar's Add opens the dialog as a sheet, without the desktop hint", async ({
		page,
	}) => {
		await userWithProfile(page);
		await page
			.getByRole("navigation", { name: "Main" })
			.getByRole("button", { name: "Add Transaction" })
			.click();

		await expect(entry(page)).toBeVisible();
		await expect(entry(page).getByText(/to save$/)).toBeHidden();
		await expect(
			entry(page).getByRole("button", { name: "Cancel" }),
		).toBeHidden();
		const box = await entry(page).boundingBox();
		expect(box!.width).toBeGreaterThanOrEqual(370);
		expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(735);
		await fillExpense(page, "50", "Chai Point");
		await entry(page).getByRole("button", { name: "Save", exact: true }).click();
		await expect(page.getByText("Transaction saved.")).toBeVisible();
		await expect(list(page)).toBeVisible();
	});
});
