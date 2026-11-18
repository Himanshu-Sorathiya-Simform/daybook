import { type BrowserContext, type Page } from "@playwright/test";

import { scan } from "./axe";
import { open, userWithGolden, userWithStress } from "./data";
import { expect, test } from "./fixtures";
import { choose, control, panel, rows, searchBox } from "./transactions";

const WIDTHS = [
	["phone", { width: 375, height: 740 }],
	["desktop", { width: 1440, height: 1000 }],
] as const;

/** The panel docked, or the drawer below 1180 px. */
const details = (page: Page, phone: boolean) =>
	phone ? page.getByRole("dialog", { name: "Transaction details" }) : panel(page);

const entry = (page: Page, name: string) => page.getByRole("dialog", { name });

for (const theme of ["light", "dark"] as const) {
	for (const [size, viewport] of WIDTHS) {
		test.describe(`${theme}, ${size}`, () => {
			test.use({
				viewport,
				colorScheme: theme,
				actionTimeout: 20_000,
				timezoneId: "Asia/Kolkata",
				locale: "en-IN",
			});
			const phone = size === "phone";

			// AC-F03-24: the list, the panel or drawer, the filters and the search.
			test("the list, the panel or drawer, the filters and the search have no serious violation", async ({
				page,
			}) => {
				test.setTimeout(240_000);
				await userWithGolden(
					page,
					"/transactions?from=2026-10-01&to=2026-10-31",
				);
				await expect(rows(page).first()).toBeVisible();
				await scan(page, "the list");

				await rows(page).nth(1).click();
				await expect(details(page, phone)).toContainText("₹");
				await scan(page, phone ? "the drawer" : "the panel");
				await page.keyboard.press("Escape");

				if (phone) {
					await page.getByRole("button", { name: /^Filters/ }).click();
					await expect(
						page.getByRole("dialog", { name: "Filters" }),
					).toBeVisible();
					await scan(page, "the Filters sheet");
					await page.keyboard.press("Escape");
				} else {
					for (const name of [
						"Type",
						"Category",
						"Date",
						"Amount",
						"More",
					]) {
						await control(page, name).click();
						await scan(page, `the ${name} filter`);
						await page.keyboard.press("Escape");
					}
				}
				await page
					.getByRole("button", { name: /^Group and sort/ })
					.first()
					.click();
				await scan(page, "the Group and sort menu");
				await page.keyboard.press("Escape");

				// The search box is on the page from desktop width; a phone searches from the header.
				if (!phone) {
					await searchBox(page).fill("swiggy");
					await expect(rows(page).first()).toContainText("Swiggy");
					await scan(page, "a search with matches");
					await searchBox(page).fill("zzzzz");
					await expect(rows(page)).toHaveCount(0);
					await scan(page, "a search with no matches");
				}
			});

			// AC-F03-24: the dialogs.
			test("New, Edit and Duplicate Transaction, Discard and Delete have no serious violation", async ({
				page,
			}) => {
				test.setTimeout(240_000);
				await userWithGolden(
					page,
					"/transactions?from=2026-10-01&to=2026-10-31",
				);
				await expect(rows(page).first()).toBeVisible();

				await page
					.getByRole("button", { name: "Add Transaction" })
					.first()
					.click();
				const add = entry(page, "New Transaction");
				await expect(add).toBeVisible();
				await scan(page, "New Transaction");
				await add.getByRole("textbox", { name: "Amount" }).fill("250");
				await choose(add, "radio", "Food");
				await scan(page, "New Transaction, filled in");
				await page.keyboard.press("Escape");
				const discard = page.getByRole("alertdialog");
				await expect(discard).toBeVisible();
				await scan(page, "the Discard confirmation");
				await discard.getByRole("button", { name: "Discard" }).click();
				await expect(add).toBeHidden();

				await rows(page).nth(1).click();
				await details(page, phone)
					.getByRole("button", { name: "Edit" })
					.click();
				const edit = entry(page, "Edit Transaction");
				await expect(edit).toBeVisible();
				await scan(page, "Edit Transaction");
				await page.keyboard.press("Escape");
				await expect(edit).toBeHidden();

				await details(page, phone)
					.getByRole("button", { name: "Duplicate" })
					.click();
				await expect(entry(page, "Duplicate Transaction")).toBeVisible();
				await scan(page, "Duplicate Transaction");
				await page.keyboard.press("Escape");

				await details(page, phone)
					.getByRole("button", { name: "Delete" })
					.click();
				await expect(page.getByRole("alertdialog")).toBeVisible();
				await scan(page, "the Delete confirmation");
				await page.keyboard.press("Escape");
			});

			// AC-F03-24, AC-F03-54: a saved view's dialogs.
			test("Save as view and the views bar have no serious violation", async ({
				page,
			}) => {
				test.setTimeout(240_000);
				await userWithGolden(page, "/transactions?cat=food");
				await expect(rows(page).first()).toBeVisible();
				await scan(page, "an edited filter with Save as view");
				await page
					.getByRole("button", { name: "Save as view", exact: true })
					.click();
				await expect(page).toHaveURL(/view=[0-9a-f-]{36}$/);
				await scan(page, "a saved view");
			});

			// AC-F03-24, BR-F03-24: the conflict view.
			test("the conflict view has no serious violation", async ({
				page,
				context,
			}) => {
				test.setTimeout(240_000);
				const { golden } = await userWithGolden(page);
				const link = `/transactions?txn=${golden.id(24)}`;
				await open(page, link);
				await expect(details(page, phone)).toContainText("−₹640.00");
				await details(page, phone)
					.getByRole("button", { name: "Edit" })
					.click();
				const mine = entry(page, "Edit Transaction");

				const other = await secondWindow(context, link, viewport);
				await details(other, phone)
					.getByRole("button", { name: "Edit" })
					.click();
				const theirs = entry(other, "Edit Transaction");
				await theirs.getByRole("textbox", { name: "Amount" }).fill("700");
				await theirs
					.getByRole("button", { name: "Save", exact: true })
					.click();
				await expect(theirs).toBeHidden();

				await mine.getByRole("textbox", { name: "Amount" }).fill("800");
				await mine
					.getByRole("button", { name: "Save", exact: true })
					.click();
				const view = page.getByRole("dialog", {
					name: "This Transaction changed on another device",
				});
				await expect(view).toBeVisible();
				await scan(page, "the conflict view");
			});

			// AC-F03-22, AC-F03-24: Load more, with the stress account.
			test("the list with Load more has no serious violation", async ({
				page,
			}) => {
				test.setTimeout(300_000);
				await userWithStress(page);
				await expect(rows(page)).toHaveCount(50);
				await page
					.getByRole("button", { name: "Load more" })
					.scrollIntoViewIfNeeded();
				await scan(page, "the list with Load more");
			});
		});
	}
}

/** A second window of the same user, on `path`. */
async function secondWindow(
	context: BrowserContext,
	path: string,
	viewport: { width: number; height: number },
) {
	const other = await context.newPage();
	await other.setViewportSize(viewport);
	await open(other, path);
	return other;
}
