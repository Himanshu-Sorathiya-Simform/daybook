import {
	type BrowserContext,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";

import { formatMonth } from "@/lib/date-format";
import { shiftMonth } from "@/lib/budgets/months";
import { todayIn } from "@/lib/time";
import { open } from "./data";

/** Shared locators and helpers for the Budgets page's end-to-end tests (F04 section 6). */

/** The profile's formats, golden's (the tests' accounts are created with them). */
const FORMATS = { dateLocale: "en-IN" };
const TIMEZONE = "Asia/Kolkata";

/** The profile's current month on the real clock, `YYYY-MM`: the dialogs' months start there
 * (BR-F04-07), so their button names follow the day the test runs. */
export const currentMonth = () => todayIn(TIMEZONE, new Date()).slice(0, 7);

/** A month's name as a dialog button writes it, with its year only outside the current year:
 * "November", "January 2027" (BR-F04-28). */
export function monthName(month: string): string {
	const sameYear = month.slice(0, 4) === currentMonth().slice(0, 4);
	return formatMonth(month, FORMATS, sameYear ? "name" : "long");
}

/** A month as a notice writes it: "November 2026" (BR-F04-29). */
export const longMonth = (month: string) => formatMonth(month, FORMATS, "long");

/** A month as the limit history writes it, "Nov 2026". */
export const shortMonth = (month: string) => formatMonth(month, FORMATS, "short");

/** The month `count` after the current one. */
export const monthAfter = (count: number) => shiftMonth(currentMonth(), count);

/** A Budget row or a Not budgeted or Not active row, by its key: `budget:food`,
 * `unbudgeted:housing`, `inactive:transportation`. */
export const row = (page: Page, key: string): Locator =>
	page.locator(`[role="row"][data-key="${key}"]`);

/** The list's grid (BR-F04-15). */
export const list = (page: Page) => page.getByRole("grid", { name: "Budgets" });

/** The docked panel (BR-F04-30). */
export const panel = (page: Page) =>
	page.getByRole("complementary", { name: "Budget details" });

/** The drawer below 1180 px, which carries the same name. */
export const drawer = (page: Page) =>
	page.getByRole("dialog", { name: "Budget details" });

/** A dialog by its title. */
export const dialog = (page: Page, name: string | RegExp) =>
	page.getByRole("dialog", { name });

/** The conflict view's dialog (BR-F04-23). */
export const conflictView = (page: Page) =>
	page.getByRole("dialog", { name: "This Budget changed on another device" });

/** The limit field of an Add or Change dialog. */
export const limitBox = (within: Locator) => within.getByRole("textbox");

/** Presses a ChoiceGroup option by its words, as a user does: React Aria draws its own circle
 * over the hidden input, which takes the press. */
export const chooseOption = (within: Locator, words: string) =>
	within.getByText(words, { exact: true }).click();

/** Picks `month` in a dialog's Other month grid, which opens on the current month's year, so
 * it goes back as many years as that month is from it. */
export async function pickInGrid(page: Page, month: string): Promise<void> {
	await page.getByRole("radio", { name: "Other month" }).click();
	const back = Number(currentMonth().slice(0, 4)) - Number(month.slice(0, 4));
	for (let step = 0; step < back; step++) {
		await page.getByRole("button", { name: /Previous year/ }).click();
	}
	await page
		.getByRole("option", { name: new RegExp(`^${longMonth(month)}`) })
		.click();
}

/** Picks the earliest month a dialog's grid allows, 36 months back (BR-F04-07). */
export async function pickEarliestMonth(page: Page): Promise<void> {
	await page.getByRole("radio", { name: "Other month" }).click();
	for (let step = 0; step < 3; step++) {
		await page.getByRole("button", { name: /Previous year/ }).click();
	}
	await page
		.locator('[role="option"]:not([aria-disabled="true"])')
		.first()
		.click();
}

/** The overview's "of ₹11,000.00 · 119.7% · Over by ₹2,168.00" line (BR-F04-15). */
export const overviewLine = (page: Page) =>
	page.getByText(/^of ₹[\d,]+\.\d\d · /).first();

/** Waits until the page shows a notice with `text`. */
export async function expectNotice(page: Page, text: string | RegExp) {
	await expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();
}

/** The Not budgeted or Not active group's header button, "Not active this month · 1". */
export const group = (page: Page, name: RegExp) =>
	page.getByRole("button", { name });

/** Whether the page scrolls sideways, which a phone layout must never do. */
export const scrollsSideways = (page: Page) =>
	page.evaluate(
		() =>
			document.documentElement.scrollWidth
			> document.documentElement.clientWidth,
	);

/** A second window of the same user, as another device would be: the same session, on the page
 * `path`, hydrated. */
export async function secondWindow(
	context: BrowserContext,
	path: string,
	viewport = { width: 1440, height: 1000 },
): Promise<Page> {
	const other = await context.newPage();
	await other.setViewportSize(viewport);
	await open(other, path);
	return other;
}

/** Changes Food to `limit` from the current month in `page`'s dialog, as the other window does
 * to make a Budget stale. */
export async function changeFoodFromNow(page: Page, limit: string): Promise<void> {
	await row(page, "budget:food").click();
	await panel(page).getByRole("button", { name: "Change limit" }).click();
	const change = dialog(page, "Change the Food limit");
	await limitBox(change).fill(limit);
	await change
		.getByRole("button", { name: `Change from ${monthName(currentMonth())}` })
		.click();
	await expect(change).toBeHidden();
}

/** Selects a row unless it is selected already: a second press on a selected row clears it. */
export async function selectRow(page: Page, key: string): Promise<void> {
	const target = row(page, key);
	if ((await target.getAttribute("aria-selected")) !== "true")
		await target.click();
}
