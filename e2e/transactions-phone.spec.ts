import { type Page } from "@playwright/test";

import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import { query, rows } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 375, height: 740 },
});

const sheet = (page: Page) => page.getByRole("dialog", { name: "Filters" });
const toggle = (page: Page, group: "Type" | "Category", name: RegExp) =>
	sheet(page).getByRole("toolbar", { name: group }).getByRole("button", { name });

// AC-F03-61 (with Type, whose count holds on any day; the preset half is in FilterSheet.test)
test("the sheet's draft counts its rows, and Show writes it as one history entry", async ({
	page,
}) => {
	await userWithGolden(page);
	await expect(rows(page)).toHaveCount(22);
	await page.getByRole("button", { name: /^Filters/ }).click();
	await toggle(page, "Type", /^Income/).click();

	const show = sheet(page).getByRole("button", { name: /^(Show|No matches)/ });
	await expect(show).toHaveText("Show 3 Transactions");
	expect(query(page)).toBe("");
	const before = await page.evaluate(() => window.history.length);
	await show.click();

	await expect(page).toHaveURL(/\?type=income$/);
	await expect(rows(page)).toHaveCount(3);
	await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
	expect(await page.evaluate(() => window.history.length)).toBe(before + 1);
	await page.goBack();
	await expect(page).toHaveURL(/\/transactions$/);
});

// AC-F03-61
test("a draft with no rows reads No matches", async ({ page }) => {
	await userWithGolden(page);
	await page.getByRole("button", { name: /^Filters/ }).click();
	await toggle(page, "Type", /^Income/).click();
	await toggle(page, "Category", /^Food/).click();

	await expect(
		sheet(page).getByRole("button", { name: /^(Show|No matches)/ }),
	).toHaveText("No matches");
});

// BR-F03-70: below 1180 px a tapped row opens the drawer.
test("a tapped row opens the drawer over the list", async ({ page }) => {
	await userWithGolden(
		page,
		"/transactions?from=2026-10-01&to=2026-10-31&cat=food",
	);
	await rows(page).nth(1).click();
	const drawer = page.getByRole("dialog", { name: "Transaction details" });
	await expect(drawer).toContainText("−₹640.00");
	await expect(page).toHaveURL(/txn=[0-9a-f-]{36}$/);
});
