import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import {
	chooseOption,
	currentMonth,
	dialog,
	expectNotice,
	limitBox,
	longMonth,
	monthName,
	panel,
	row,
	shortMonth,
} from "./budgets";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	actionTimeout: 20_000,
	viewport: { width: 1440, height: 1000 },
});

// F04 section 10 and section 6 before M5 (D-241, D-569).
test("offline, the month shown stays with as of; another month says it isn't saved; saving waits", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets");
	await expect(page.getByText(/^Budgeted spending in /)).toBeVisible();
	await context.setOffline(true);
	try {
		await expect(page.getByText(/^as of /)).toBeVisible();
		await expect(page.getByText(/^Budgeted spending in /)).toBeVisible();

		// Another month was never read: it says so, and Go to leads back.
		await page.getByRole("button", { name: "Previous month" }).click();
		await expect(
			page.getByText("You're offline. This month isn't saved on this device."),
		).toBeVisible();
		await expect(
			page.getByText(
				`Only ${longMonth(currentMonth())} is kept for offline use.`,
			),
		).toBeVisible();
		await expect(panel(page)).toBeHidden();
		await page
			.getByRole("button", {
				name: `Go to ${monthName(currentMonth()).split(" ")[0]}`,
			})
			.click();
		await expect(page.getByText(/^Budgeted spending in /)).toBeVisible();

		// A dialog opens and its Save waits.
		await page.getByRole("button", { name: "Add a Budget" }).first().click();
		const add = dialog(page, "Add a Budget");
		await expect(
			add.getByText("You are offline. Connect to save."),
		).toBeVisible();
		await expect(
			add.getByRole("button", { name: /^Add Budget from/ }),
		).toHaveAttribute("aria-disabled", "true");
		await page.keyboard.press("Escape");
	} finally {
		await context.setOffline(false);
	}

	// Back online, the other months load again.
	await expect(page.getByText(/^as of /)).toBeHidden();
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(page.getByText(/^Budgeted spending in /)).toBeVisible();
});

// BR-F04-29, D-569: Undo and Remove are tried at once and fail with the notice's message.
test("offline, Undo fails at once with the notice's message and nothing changes", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets");
	await row(page, "budget:food").click();
	await panel(page).getByRole("button", { name: "Change limit" }).click();
	const change = dialog(page, "Change the Food limit");
	await limitBox(change).fill("7000");
	await change
		.getByRole("button", { name: `Change from ${monthName(currentMonth())}` })
		.click();
	await expectNotice(
		page,
		`Food limit is now ₹7,000.00 from ${longMonth(currentMonth())}.`,
	);

	await context.setOffline(true);
	try {
		await panel(page).getByRole("button", { name: "Undo" }).click();
		await expect(panel(page).getByRole("alert")).toHaveText(
			/The Budget could not be saved\. Check your connection and try again\./,
		);
		await expect(panel(page).getByRole("button", { name: "Undo" })).toHaveCount(
			0,
		);
		await panel(page).getByRole("button", { name: "Dismiss" }).click();
	} finally {
		await context.setOffline(false);
	}
	// Nothing was undone: the change is still there.
	await expect(
		panel(page).getByRole("region", { name: "Limit history" }),
	).toContainText("₹7,000.00 from");
});

test("offline, Remove fails at once, and the one-month limit stays", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets");
	await row(page, "budget:food").click();
	await panel(page).getByRole("button", { name: "Change limit" }).click();
	const change = dialog(page, "Change the Food limit");
	await limitBox(change).fill("8000");
	await chooseOption(change, "One month only");
	await change
		.getByRole("button", { name: `Change ${monthName(currentMonth())} only` })
		.click();
	await expect(change).toBeHidden();

	await context.setOffline(true);
	try {
		await panel(page)
			.getByRole("button", {
				name: `Remove ₹8,000.00 in ${shortMonth(currentMonth())} only`,
			})
			.click();
		await expect(panel(page).getByRole("alert")).toContainText(
			"The Budget could not be saved. Check your connection and try again.",
		);
	} finally {
		await context.setOffline(false);
	}
	await expect(
		panel(page).getByRole("region", { name: "Limit history" }),
	).toContainText(`₹8,000.00 in ${shortMonth(currentMonth())} only`);
});

// Section 6: a failed load offers Retry.
test("a month that fails to load says so and Retry loads it", async ({ page }) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	let fail = true;
	await page.route("**/api/budgets?month=2026-09", (route) =>
		fail ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
	);
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(page.getByText("Budgets could not be loaded.")).toBeVisible({
		timeout: 40_000,
	});
	await expect(
		page.getByText(
			"Check your connection, then try again. Your Budgets are safe.",
		),
	).toBeVisible();
	fail = false;
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(page.getByText("Needs attention · 2")).toBeVisible();
});
