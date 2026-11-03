import { type Page } from "@playwright/test";

import { logIn, logOut, onboardedUser } from "./accounts";
import { expect, test } from "./fixtures";

/** Records whether `html` has the `dark` class when `DOMContentLoaded` fires, before React
 * runs, on every page load in the context. */
async function watchFirstPaint(page: Page) {
	await page.addInitScript(() => {
		document.addEventListener("DOMContentLoaded", () => {
			(window as unknown as { darkAtLoad: boolean }).darkAtLoad =
				document.documentElement.classList.contains("dark");
		});
	});
}

const darkAtLoad = (page: Page) =>
	page.evaluate(() => (window as unknown as { darkAtLoad?: boolean }).darkAtLoad);

/** Chooses a theme as Settings → Appearance will: next-themes' own key (BR-F02-21). The
 * Appearance page arrives with the settings pages. */
const choose = (page: Page, theme: "light" | "dark" | "system") =>
	page.evaluate((value) => localStorage.setItem("daybook.theme", value), theme);

// AC-F02-14
test("Dark applies before the page runs, with no CSP violation, and survives logout and login", async ({
	page,
}) => {
	await watchFirstPaint(page);
	const account = await onboardedUser(page);
	await choose(page, "dark");
	await page.reload();
	expect(await darkAtLoad(page)).toBe(true);
	await expect(page.locator("html")).toHaveClass(/\bdark\b/);
	await logOut(page);
	await expect(page).toHaveURL("/login");
	expect(await darkAtLoad(page)).toBe(true);
	await logIn(page, account);
	expect(await darkAtLoad(page)).toBe(true);
	await expect(page.locator("html")).toHaveClass(/\bdark\b/);
	// The CSP fixture fails the test on any violation in the console.
});

test.describe("system theme", () => {
	test.use({ colorScheme: "dark" });

	test("follows a dark device with no choice made", async ({ page }) => {
		await watchFirstPaint(page);
		await page.goto("/login");
		expect(await darkAtLoad(page)).toBe(true);
	});

	test("Light chosen on a dark device stays light", async ({ page }) => {
		await watchFirstPaint(page);
		await page.goto("/login");
		await choose(page, "light");
		await page.reload();
		expect(await darkAtLoad(page)).toBe(false);
		await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
	});
});

/** The `theme-color` tags' distinct colours. */
const themeColors = (page: Page) =>
	page
		.locator('meta[name="theme-color"]')
		.evaluateAll((metas) => [
			...new Set(metas.map((meta) => meta.getAttribute("content"))),
		]);

/** The one colour both tags hold, once `ThemeColor` has set them in its effect, after the
 * page loaded. */
async function themeColor(page: Page): Promise<string> {
	await expect.poll(async () => (await themeColors(page)).length).toBe(1);
	return (await themeColors(page))[0] ?? "";
}

// BR-F02-22
test("the browser's theme-color follows the chosen theme", async ({ page }) => {
	await page.goto("/login");
	await choose(page, "dark");
	await page.reload();
	const dark = await themeColor(page);
	await choose(page, "light");
	await page.reload();
	const light = await themeColor(page);
	expect(light).not.toBe(dark);
});
