import { type Page } from "@playwright/test";

import { scan } from "./axe";
import { open, userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import {
	chooseOption,
	conflictView,
	dialog,
	drawer,
	group,
	limitBox,
	panel,
	pickEarliestMonth,
	pickInGrid,
	row,
} from "./budgets";

const WIDTHS = [
	["phone", { width: 375, height: 740 }],
	["desktop", { width: 1440, height: 1000 }],
] as const;

/** The panel docked, or the drawer below 1180 px. */
const details = (page: Page, phone: boolean) => (phone ? drawer(page) : panel(page));

/** Presses a button of the panel or drawer, selecting the row first unless it already is: a
 * second press on a selected row would clear it, and on a phone the open drawer covers it. */
async function press(page: Page, phone: boolean, key: string, button: string) {
	const target = details(page, phone).getByRole("button", { name: button });
	if (!(await target.isVisible())) await row(page, key).click();
	await target.click();
}

for (const theme of ["light", "dark"] as const) {
	for (const [size, viewport] of WIDTHS) {
		test.describe(`${theme}, ${size}`, () => {
			test.use({
				viewport,
				colorScheme: theme,
				timezoneId: "Asia/Kolkata",
				locale: "en-IN",
			});
			const phone = size === "phone";

			// AC-F04-12: the list, the table, the panel and the drawer.
			test("the list, the panel or drawer, the table, the month grid and the filter have no serious violation", async ({
				page,
			}) => {
				test.setTimeout(240_000);
				await userWithGolden(page, "/budgets?month=2026-10");
				await expect(page.getByText("Needs attention · 4")).toBeVisible();
				await scan(page, "the October list");

				await row(page, "budget:food").click();
				await expect(details(page, phone)).toContainText(
					"Where it went in October",
				);
				await expect(details(page, phone)).toContainText("BigBasket");
				await scan(page, phone ? "Food's drawer" : "Food's panel");
				if (phone) {
					await drawer(page)
						.getByRole("button", { name: "Close details" })
						.click();
					await expect(drawer(page)).toBeHidden();
				} else {
					await page.keyboard.press("Escape");
				}

				if (!phone) {
					await page
						.getByRole("radio", { name: "Table" })
						.locator("xpath=ancestor::label[1]")
						.click();
					await expect(
						page.getByRole("grid", { name: /October 2026/ }),
					).toBeVisible();
					await scan(page, "the table");
					await page
						.getByRole("columnheader", { name: /^Utilization/ })
						.click();
					await scan(page, "the sorted table");
					await page
						.getByRole("radio", { name: "List" })
						.locator("xpath=ancestor::label[1]")
						.click();
				}

				await page.getByRole("button", { name: "October 2026" }).click();
				await expect(
					page.getByRole("option", { name: /^October 2026, \d/ }),
				).toBeVisible();
				await scan(page, "the month grid with its figures");
				await page.keyboard.press("Escape");

				await page.getByRole("button", { name: /^Over budget/ }).click();
				await scan(page, "the list filtered to Over budget");
				await page.getByRole("button", { name: /^On track/ }).click();
				await expect(
					page.getByText("No Budgets are on track in October 2026."),
				).toBeVisible();
				await scan(page, "the filtered empty text");
			});

			test("the September page's groups and a month with no Budget have no serious violation", async ({
				page,
			}) => {
				test.setTimeout(120_000);
				await userWithGolden(page, "/budgets?month=2026-09");
				await expect(page.getByText("Not budgeted · 3")).toBeVisible();
				await group(page, /^Not active this month · 1/).click();
				await expect(row(page, "inactive:transportation")).toBeVisible();
				await scan(page, "September with Not active open");

				await page.goto("/budgets?month=2026-08");
				await expect(
					page.getByText("No Budgets for August 2026."),
				).toBeVisible();
				await scan(page, "a month with no Budget");
			});

			// AC-F04-12: each dialog.
			test("Add, Change with its previews, Stop, Delete and the month grid in a dialog have no serious violation", async ({
				page,
			}) => {
				test.setTimeout(240_000);
				await userWithGolden(page, "/budgets?month=2026-10");
				await expect(page.getByText("Needs attention · 4")).toBeVisible();

				await page
					.getByRole("button", { name: "Add a Budget" })
					.first()
					.click();
				const add = dialog(page, "Add a Budget");
				await expect(add).toBeVisible();
				await scan(page, "Add a Budget");
				await add
					.getByRole("radio", { name: /^Housing/ })
					.locator("xpath=ancestor::label[1]")
					.click();
				await limitBox(add).fill("20000");
				await scan(page, "Add a Budget, filled in");
				await page.keyboard.press("Escape");
				await expect(add).toBeHidden();

				await press(page, phone, "budget:food", "Change limit");
				const change = dialog(page, "Change the Food limit");
				await expect(change).toBeVisible();
				await scan(page, "Change limit");
				await limitBox(change).fill("7000");
				await pickInGrid(page, "2026-09");
				await expect(
					change.getByRole("region", { name: "What changes" }),
				).toContainText("84.2% Nearing limit");
				await scan(page, "Change limit with its cards and notes");

				await chooseOption(change, "One month only");
				await change
					.getByRole("radio", { name: "October (viewing)" })
					.click();
				await expect(change).toContainText("Only October 2026 changes");
				await scan(page, "Change limit for one month only");

				await chooseOption(change, "From a month onward");
				await pickEarliestMonth(page);
				await expect(
					change.getByRole("table", { name: "Months that change" }),
				).toBeVisible();
				await scan(page, "Change limit with its strip and table");
				await page.keyboard.press("Escape");
				await expect(change).toBeHidden();

				await press(page, phone, "budget:food", "Stop");
				const stop = dialog(page, "Stop budgeting Food");
				await pickInGrid(page, "2026-09");
				await expect(
					stop.getByText(
						"This would remove every month. Delete the Budget instead.",
					),
				).toBeVisible();
				await scan(page, "Stop with its refusal");
				await stop
					.getByRole("button", { name: "Delete Budget instead" })
					.click();
				const confirm = page.getByRole("alertdialog", {
					name: "Delete the Food Budget?",
				});
				await expect(confirm).toBeVisible();
				await scan(page, "the Delete confirmation");
				await page.keyboard.press("Escape");
			});

			// AC-F04-12: the conflict view and the Undo notice.
			test("the conflict view and the Undo notice have no serious violation", async ({
				page,
				context,
			}) => {
				test.setTimeout(240_000);
				await userWithGolden(page, "/budgets?month=2026-10");
				await press(page, phone, "budget:food", "Change limit");
				const mine = dialog(page, "Change the Food limit");

				const other = await context.newPage();
				await other.setViewportSize(viewport);
				await open(other, "/budgets?month=2026-10");
				await press(other, phone, "budget:food", "Change limit");
				const theirs = dialog(other, "Change the Food limit");
				await limitBox(theirs).fill("5500");
				await theirs.getByRole("button", { name: /^Change from/ }).click();
				await expect(theirs).toBeHidden();

				await limitBox(mine).fill("7000");
				await mine.getByRole("radio", { name: /^Next month/ }).click();
				await mine.getByRole("button", { name: /^Change from/ }).click();
				await expect(conflictView(page)).toBeVisible();
				await scan(page, "the conflict view");
				await conflictView(page)
					.getByRole("button", { name: "Keep mine" })
					.click();
				await expect(conflictView(page)).toBeHidden();
				await expect(details(page, phone).getByRole("status")).toBeVisible();
				await scan(page, "the Undo notice in the panel");
			});
		});
	}
}
