import { type Locator, type Page } from "@playwright/test";

/** Presses Tab until `target` has focus, as a keyboard user would; fails after `limit` steps
 * so a field the keyboard cannot reach fails the test. */
export async function tabTo(page: Page, target: Locator, limit = 15) {
	for (let step = 0; step < limit; step++) {
		await page.keyboard.press("Tab");
		if (await target.evaluate((element) => element === document.activeElement))
			return;
	}
	throw new Error(`Tab never reached ${target.toString()}`);
}
