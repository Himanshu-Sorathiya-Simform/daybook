import { type Page } from "@playwright/test";

import { userWithGolden, userWithStress } from "./data";
import { expect, test } from "./fixtures";
import { tabTo } from "./keyboard";
import { expectSelected, list, row, rows, searchBox } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

const focused = (page: Page) =>
	page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null);

// AC-F03-24, BR-F03-52: the core flow with the keyboard alone.
test("add, search, move, open, edit, duplicate and delete with the keyboard alone", async ({
	page,
}) => {
	test.slow();
	await userWithGolden(
		page,
		"/transactions?from=2026-10-01&to=2026-10-31&cat=food",
	);

	// N opens the dialog with focus on Amount; Ctrl or Cmd+Enter saves.
	await page.keyboard.press("n");
	const entry = page.getByRole("dialog", { name: "New Transaction" });
	await expect(entry.getByRole("textbox", { name: "Amount" })).toBeFocused();
	await page.keyboard.type("250");
	await tabTo(page, entry.getByRole("combobox", { name: "Payee" }), 10);
	await page.keyboard.type("Chai Point");
	await page.keyboard.press("Escape");
	await tabTo(page, entry.getByRole("radio", { name: "Food" }), 10);
	await page.keyboard.press("Space");
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(entry).toBeHidden();

	// / focuses the search; Escape clears it.
	await page.keyboard.press("/");
	await expect(searchBox(page)).toBeFocused();
	await page.keyboard.type("swiggy");
	await expect(page).toHaveURL(/q=swiggy/);
	await expect(rows(page)).toHaveCount(2);
	await page.keyboard.press("Escape");
	await expect(page).not.toHaveURL(/q=/);

	// Tab reaches the list; the arrows select, as the panel is docked.
	await tabTo(page, rows(page).first(), 60);
	await page.keyboard.press("ArrowDown");
	await expectSelected(page);
	const selected = await focused(page);

	// Enter and E edit, D duplicates; Escape leaves each untouched dialog.
	for (const [key, title] of [
		["Enter", "Edit Transaction"],
		["e", "Edit Transaction"],
		["d", "Duplicate Transaction"],
	] as const) {
		await page.keyboard.press(key);
		const dialog = page.getByRole("dialog", { name: title });
		await expect(dialog).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	}

	// Delete asks, with focus on Cancel; Tab and Enter confirm, and focus moves to the next row.
	await list(page).getByRole("row", { name: selected! }).focus();
	await page.keyboard.press("Delete");
	const confirm = page.getByRole("alertdialog", {
		name: "Delete this Transaction?",
	});
	await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
	await page.keyboard.press("Tab");
	await page.keyboard.press("Enter");
	await expect(confirm).toBeHidden();
	await expect(
		row(
			page,
			new RegExp(`^${selected!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
		),
	).toHaveCount(0);
	expect(await focused(page)).not.toBeNull();
	await expect(page.getByText("Transaction deleted.")).toBeVisible();
});

// AC-F03-24, D-535: Load more by keyboard; the last page puts focus on its first row.
test("Load more works from the keyboard, and the last page focuses its first row", async ({
	page,
}) => {
	test.slow();
	await userWithStress(page, { count: 120 });
	await expect(rows(page)).toHaveCount(50);
	const loadMore = page.getByRole("button", { name: "Load more" });
	// Pages load by scrolling too; this test drives the button alone.
	await tabTo(page, loadMore, 80);
	await page.keyboard.press("Enter");
	await expect(rows(page)).toHaveCount(100);
	await expect(loadMore).toBeFocused();

	await page.keyboard.press("Enter");
	await expect(rows(page)).toHaveCount(120);
	await expect(loadMore).toHaveCount(0);
	await expect(rows(page).nth(100)).toBeFocused();
});
