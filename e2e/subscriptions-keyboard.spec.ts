import { expect, test } from "./fixtures";
import { tabTo } from "./keyboard";
import {
	addButton,
	dialog,
	expectNotice,
	panel,
	row,
	userWithSubscriptions,
} from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	actionTimeout: 20_000,
	viewport: { width: 1440, height: 1000 },
});

// BR-F05-45, AC-F05-15: the keys, by keyboard alone.
test("E, P, C and Delete open their dialogs for the selection, and Escape closes each", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();

	await page.keyboard.press("e");
	await expect(dialog(page, "Edit Netflix")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog(page, "Edit Netflix")).toBeHidden();
	await expect(row(page, netflix)).toHaveAttribute("aria-selected", "true");

	await page.keyboard.press("p");
	await expect(dialog(page, "Pause Netflix")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog(page, "Pause Netflix")).toBeHidden();

	await page.keyboard.press("c");
	await expect(dialog(page, "Cancel Netflix?")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog(page, "Cancel Netflix?")).toBeHidden();

	await page.keyboard.press("Delete");
	await expect(
		page.getByRole("alertdialog", { name: "Delete Netflix?" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

// BR-F05-45, D-630: a key acts only where the menu offers it.
test("R does nothing on a running Subscription, and no key acts with nothing selected", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("r");
	await expect(dialog(page, /^Resume/)).toHaveCount(0);

	await page.keyboard.press("Escape");
	for (const key of ["e", "s", "p", "c", "r", "Delete"])
		await page.keyboard.press(key);
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(page.getByRole("alertdialog")).toHaveCount(0);
	await expect(
		page.getByRole("status").filter({ hasText: "Skipped" }),
	).toHaveCount(0);
});

test("a letter typed in the Name box is text, not a command", async ({ page }) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("e");
	const edit = dialog(page, "Edit Netflix");
	const name = edit.getByRole("textbox", { name: "Name" });
	await name.fill("");
	await name.pressSequentially("spcd");
	await expect(name).toHaveValue("spcd");
	await expect(dialog(page, "Pause Netflix")).toHaveCount(0);
	await expect(dialog(page, "Cancel Netflix?")).toHaveCount(0);
});

// AC-F05-15: the Add dialog and the notice work by keyboard alone.
test("Add is reached by Tab, filled from the keyboard, and its notice's Undo is reached by Tab", async ({
	page,
}) => {
	await userWithSubscriptions(page);
	await tabTo(page, addButton(page), 30);
	await page.keyboard.press("Enter");
	const add = dialog(page, "Add a Subscription");
	await expect(add).toBeVisible();
	await expect(add.getByRole("combobox", { name: "Name" })).toBeFocused();
	await page.keyboard.type("Spotify");
	// Tab leaves the list of payees, which covers the rest of the dialog while it is open.
	await page.keyboard.press("Tab");
	await expect(add.getByRole("textbox", { name: "Amount" })).toBeFocused();
	await page.keyboard.type("119");
	await add.getByRole("radio", { name: "Entertainment" }).focus();
	await page.keyboard.press("Space");
	await add.getByRole("button", { name: "Add Subscription" }).focus();
	await page.keyboard.press("Enter");
	await expectNotice(page, "Spotify added.");

	const undo = panel(page).getByRole("button", { name: "Undo", exact: true });
	await tabTo(page, undo, 40);
	await page.keyboard.press("Enter");
	await expect(page.getByRole("row", { name: /^Spotify/ })).toHaveCount(0);
});

// BR-F05-45: Up and Down skip a closed Ended group.
test("Down walks the open groups' rows and stops at the last; the Ended rows join once opened", async ({
	page,
}) => {
	const { netflix, gym, prime, old } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("ArrowDown");
	await expect(row(page, gym)).toHaveAttribute("aria-selected", "true");
	await page.keyboard.press("ArrowDown");
	await expect(row(page, prime)).toHaveAttribute("aria-selected", "true");
	await page.keyboard.press("ArrowDown");
	await expect(row(page, prime)).toHaveAttribute("aria-selected", "true");

	await page.getByRole("button", { name: "Ended · 1" }).click();
	await row(page, prime).click();
	await page.keyboard.press("ArrowDown");
	await expect(row(page, old)).toHaveAttribute("aria-selected", "true");
});
