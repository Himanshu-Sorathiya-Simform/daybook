import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import { choose, control, rows, searchBox } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

// F03 section 10 before M5 (D-533, D-534, D-241).
test("offline, the cached list stays; search, other filters and saving wait for the connection", async ({
	page,
	context,
}) => {
	await userWithGolden(page);
	await expect(rows(page)).toHaveCount(22);
	await context.setOffline(true);
	try {
		// The title says how old the figures are; the search box waits.
		await expect(page.getByText(/^as of /)).toBeVisible();
		await expect(searchBox(page)).toBeDisabled();
		await expect(searchBox(page)).toHaveAttribute(
			"placeholder",
			"Search needs a connection",
		);

		// A filter with nothing cached says why, and Clear filters goes back to the cached list.
		await control(page, "Type").click();
		await choose(
			page.getByRole("dialog", { name: "Type" }),
			"checkbox",
			/^Income/,
		);
		await page.keyboard.press("Escape");
		await expect(
			page.getByText("You're offline. Filters need a connection."),
		).toBeVisible();
		await page.getByRole("button", { name: "Clear filters" }).click();
		await expect(rows(page)).toHaveCount(22);

		// The entry dialog opens, and its Save waits (M5 brings offline saves).
		await page.keyboard.press("n");
		const dialog = page.getByRole("dialog", { name: "New Transaction" });
		await expect(
			dialog.getByText("You are offline. Connect to save."),
		).toBeVisible();
		await expect(
			dialog.getByRole("button", { name: "Save", exact: true }),
		).toHaveAttribute("aria-disabled", "true");
		await page.keyboard.press("Escape");
	} finally {
		await context.setOffline(false);
	}

	// Back online, a filter loads again.
	await expect(searchBox(page)).toBeEnabled();
	await control(page, "Type").click();
	await choose(page.getByRole("dialog", { name: "Type" }), "checkbox", /^Income/);
	await page.keyboard.press("Escape");
	await expect(rows(page)).toHaveCount(3);
	await expect(page.getByText(/^as of /)).toBeHidden();
});
