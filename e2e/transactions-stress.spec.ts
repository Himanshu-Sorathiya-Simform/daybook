import { type Page } from "@playwright/test";

import { userWithStress } from "./data";
import { expect, test } from "./fixtures";
import { list, rows } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

/** The list's own polite live region, inside its section. */
const live = (page: Page) =>
	list(page).locator("xpath=ancestor::section[1]").getByRole("status").first();

/** The first row's name: the newest stress row is "Stress Newest", alone on today. */
const firstName = (page: Page) => rows(page).first().getAttribute("aria-label");

// AC-F03-22, BR-F03-30, D-535: 1,000 rows, at most 5 pages kept, and back to the top.
test("scrolling through 1,000 rows keeps at most 250, and scrolling back reaches the newest", async ({
	page,
}) => {
	test.setTimeout(600_000);
	await userWithStress(page);
	await expect(rows(page)).toHaveCount(50);
	expect(await firstName(page)).toMatch(/^Stress Newest, Food, /);

	let loads = 0;
	let most = 50;
	// Scroll to the end until the last page has come: 20 pages of 50.
	while (await page.getByRole("button", { name: "Load more" }).count()) {
		const before = await rows(page).last().getAttribute("data-key");
		await page
			.getByRole("button", { name: "Load more" })
			.scrollIntoViewIfNeeded();
		await expect(rows(page).last()).not.toHaveAttribute("data-key", before!, {
			timeout: 30_000,
		});
		loads += 1;
		const count = await rows(page).count();
		most = Math.max(most, count);
		expect(count).toBeLessThanOrEqual(250);
		await expect(live(page)).toContainText(/Loaded \d+ more Transactions?/);
		if (loads > 25) throw new Error("Load more never went away.");
	}
	expect(loads).toBe(19);
	expect(most).toBe(250);
	// The newest pages were trimmed from the top, with Load earlier to bring them back.
	expect(await firstName(page)).not.toMatch(/^Stress Newest/);
	await expect(page.getByRole("button", { name: "Load earlier" })).toBeVisible();

	// Back up by scrolling to the top: each page loads as the top comes into view, and the next
	// one while it stays there (BR-F03-30), so the list may climb several pages at once and drop
	// Load earlier on its own. Waiting on the rows, never on the button, keeps up with it.
	for (let step = 0; step < 25; step++) {
		if ((await firstName(page))?.startsWith("Stress Newest")) break;
		const top = await rows(page).first().getAttribute("data-key");
		await page.evaluate(() => window.scrollTo(0, 0));
		await expect(rows(page).first()).not.toHaveAttribute("data-key", top!, {
			timeout: 30_000,
		});
		expect(await rows(page).count()).toBeLessThanOrEqual(250);
	}
	await expect(rows(page).first()).toHaveAttribute(
		"aria-label",
		/^Stress Newest, Food, /,
	);
	await expect(page.getByRole("button", { name: "Load earlier" })).toHaveCount(0);
});
