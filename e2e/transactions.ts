import { expect, type Locator, type Page } from "@playwright/test";

/** Shared locators for the Transactions page's end-to-end tests (F03 section 6). */

/** The list, a React Aria grid; the filter chips are a grid of their own. */
export const list = (page: Page) => page.getByRole("grid", { name: "Transactions" });

/** The list's Transaction rows, not its group headers. */
export const rows = (page: Page) => list(page).locator('[role="row"][data-key]');

/** A row by its accessible name, "Swiggy, Food, 10:15 pm, −₹640.00" (BR-F03-32). */
export const row = (page: Page, name: RegExp) =>
	list(page).getByRole("row", { name });

/** A header figure's text: Count, In, Out or To Goals (BR-F03-41). */
export const figure = (page: Page, label: "Count" | "In" | "Out" | "To Goals") =>
	page
		.locator("dt", { hasText: new RegExp(`^${label}$`) })
		.locator("xpath=following-sibling::dd[1]");

export const searchBox = (page: Page) =>
	page.getByRole("searchbox", { name: "Search Transactions" });

/** A desktop filter control's button, "Type Any" or "Date All time". */
export const control = (page: Page, name: string) =>
	page.getByRole("button", { name: new RegExp(`^${name}`) });

/** The docked panel, or the drawer below 1180 px (BR-F03-70). */
export const panel = (page: Page) =>
	page.getByRole("complementary", { name: "Transaction details" });

/** Waits until the panel, docked or the drawer, shows a selected row. Only then has the page
 * rendered the selection and turned its row keys on: `txn` reaches the address bar a render
 * earlier, as Next's router takes the history call in later, and a key pressed in between does
 * nothing. Only the panel on show has a visible Close details. */
export async function expectSelected(page: Page) {
	await expect(page).toHaveURL(/txn=/);
	await expect(page.getByRole("button", { name: "Close details" })).toBeVisible();
}

/** Picks a checkbox or radio by pressing its label, as a user does: React Aria draws its own box
 * over the hidden input, which takes the press. */
export async function choose(
	within: Locator | Page,
	role: "checkbox" | "radio",
	name: RegExp | string,
): Promise<void> {
	await within
		.getByRole(role, { name })
		.locator("xpath=ancestor::label[1]")
		.click();
}

/** The four header figures, once the summary has answered. */
export async function expectHeader(
	page: Page,
	{ count, inText, out }: { count: number; inText: string; out: string },
): Promise<void> {
	await expect(figure(page, "Count")).toHaveText(String(count));
	await expect(figure(page, "In")).toHaveText(inText);
	await expect(figure(page, "Out")).toHaveText(out);
}

/** Waits for the list's rows to read exactly `names`, top to bottom. */
export async function expectRows(page: Page, names: RegExp[]): Promise<void> {
	await expect(rows(page)).toHaveCount(names.length);
	for (const [index, name] of names.entries()) {
		await expect(rows(page).nth(index)).toHaveAccessibleName(name);
	}
}

/** The URL's query, as the page wrote it last. */
export const query = (page: Page) => new URL(page.url()).search;

/** Every request the page sends to `path`, from now on. */
export function requestsTo(page: Page, path: RegExp): string[] {
	const seen: string[] = [];
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (path.test(url.pathname))
			seen.push(`${request.method()} ${url.pathname}${url.search}`);
	});
	return seen;
}

export type { Locator };
