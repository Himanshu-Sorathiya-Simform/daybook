import { type Page } from "@playwright/test";

import { scan } from "./axe";
import { expect, test } from "./fixtures";
import {
	chooseView,
	openAdd,
	conflictView,
	dialog,
	drawer,
	expectNotice,
	panel,
	renameIn,
	row,
	secondWindow,
	userWithSubscriptions,
} from "./subscriptions";

const WIDTHS = [
	["phone", { width: 375, height: 740 }],
	["desktop", { width: 1440, height: 1000 }],
] as const;

/** The panel docked, or the drawer below 1180 px. */
const details = (page: Page, phone: boolean) => (phone ? drawer(page) : panel(page));

for (const theme of ["light", "dark"] as const) {
	for (const [size, viewport] of WIDTHS) {
		test.describe(`${theme}, ${size}`, () => {
			test.use({
				viewport,
				colorScheme: theme,
				timezoneId: "Asia/Kolkata",
				locale: "en-IN",
				actionTimeout: 20_000,
			});
			const phone = size === "phone";

			// AC-F05-15: the page, its three views, the panel and the drawer.
			test("the list, the panel or drawer, the table and the calendar have no serious violation", async ({
				page,
			}) => {
				test.setTimeout(240_000);
				const { netflix } = await userWithSubscriptions(page);
				await expect(
					page.getByText("Monthly cost", { exact: true }),
				).toBeVisible();
				await scan(page, "the list");

				await page.getByRole("button", { name: "Ended · 1" }).click();
				await scan(page, "the list with Ended open");

				await row(page, netflix).click();
				await expect(details(page, phone)).toContainText("Charges");
				await expect(details(page, phone)).toContainText("Paid so far");
				await scan(page, phone ? "Netflix's drawer" : "Netflix's panel");
				if (phone) {
					await drawer(page)
						.getByRole("button", { name: "Close details" })
						.click();
					await expect(drawer(page)).toBeHidden();
				} else {
					await page.keyboard.press("Escape");
				}

				await chooseView(page, "Calendar");
				await expect(
					page.getByRole("listbox", { name: "Month" }),
				).toBeVisible();
				await scan(page, "the calendar");

				if (!phone) {
					await chooseView(page, "Table");
					await expect(
						page.getByRole("grid", { name: /Select a column heading/ }),
					).toBeVisible();
					await scan(page, "the table");
					await page.getByRole("columnheader", { name: /^Name/ }).click();
					await scan(page, "the sorted table");
				}
			});

			test("the empty page has no serious violation", async ({ page }) => {
				const { userWithNoSubscriptions } = await import("./subscriptions");
				await userWithNoSubscriptions(page);
				await expect(page.getByText("No Subscriptions yet.")).toBeVisible();
				await scan(page, "the empty page");
			});

			// AC-F05-15: every dialog.
			test("Add, Edit, Cancel, Pause, Resume and Delete have no serious violation", async ({
				page,
			}) => {
				test.setTimeout(300_000);
				const { netflix, old } = await userWithSubscriptions(page);
				const press = async (key: string, name: string | RegExp) => {
					if (!(await details(page, phone).isVisible()))
						await row(page, netflix).click();
					await page.keyboard.press(key);
					await expect(dialog(page, name)).toBeVisible();
				};

				await openAdd(page);
				await scan(page, "the Add dialog");
				await page.keyboard.press("Escape");
				await expect(dialog(page, "Add a Subscription")).toBeHidden();

				await row(page, netflix).click();
				await press("e", "Edit Netflix");
				await expect(
					dialog(page, "Edit Netflix").getByRole("button", {
						name: "Save changes",
					}),
				).not.toHaveAttribute("aria-disabled", "true");
				await scan(page, "the Edit dialog");
				await page.keyboard.press("Escape");
				await expect(dialog(page, "Edit Netflix")).toBeHidden();

				await press("c", "Cancel Netflix?");
				await expect(
					dialog(page, "Cancel Netflix?").getByRole("button", {
						name: "Cancel Netflix",
					}),
				).not.toHaveAttribute("aria-disabled", "true");
				await scan(page, "the Cancel dialog");
				await page.keyboard.press("Escape");
				await expect(dialog(page, "Cancel Netflix?")).toBeHidden();

				await press("p", "Pause Netflix");
				await scan(page, "the Pause dialog");
				await page.keyboard.press("Escape");
				await expect(dialog(page, "Pause Netflix")).toBeHidden();

				await page.keyboard.press("Delete");
				await expect(
					page.getByRole("alertdialog", { name: "Delete Netflix?" }),
				).toBeVisible();
				await scan(page, "the Delete confirmation");
				await page.keyboard.press("Escape");
				await expect(page.getByRole("alertdialog")).toHaveCount(0);

				if (phone)
					await drawer(page)
						.getByRole("button", { name: "Close details" })
						.click();
				else await page.keyboard.press("Escape");
				await page.getByRole("button", { name: "Ended · 1" }).click();
				await row(page, old).click();
				await press("r", "Resume Old Plan?");
				await expect(
					dialog(page, "Resume Old Plan?").getByRole("button", {
						name: "Resume Old Plan",
					}),
				).not.toHaveAttribute("aria-disabled", "true");
				await scan(page, "the Resume dialog");
			});

			// AC-F05-15: the notice and the conflict view.
			test("a notice, a failure notice and the conflict view have no serious violation", async ({
				page,
				context,
			}) => {
				test.setTimeout(300_000);
				const { netflix } = await userWithSubscriptions(page);
				await row(page, netflix).click();
				await page.keyboard.press("s");
				await expectNotice(page, "Skipped the");
				await scan(page, "a notice with Undo");

				const other = await secondWindow(context);
				await renameIn(other, netflix, "Netflix HD");
				await details(page, phone)
					.getByRole("button", { name: "Undo", exact: true })
					.click();
				await expect(conflictView(page)).toBeVisible();
				await scan(page, "the conflict view");
				await page.keyboard.press("Escape");
				await conflictView(page).waitFor({ state: "hidden" });

				await context.setOffline(true);
				try {
					await details(page, phone)
						.getByRole("button", { name: "Undo", exact: true })
						.click();
					await expect(
						page
							.getByRole("alert")
							.filter({ hasText: "could not be saved" }),
					).toBeVisible();
					await scan(page, "a failure notice");
				} finally {
					await context.setOffline(false);
				}
			});
		});
	}
}
