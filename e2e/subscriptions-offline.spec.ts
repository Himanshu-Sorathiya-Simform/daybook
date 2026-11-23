import { expect, test } from "./fixtures";
import {
	dialog,
	openAdd,
	expectNotice,
	notice,
	panel,
	row,
	userWithSubscriptions,
} from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	actionTimeout: 20_000,
	viewport: { width: 1440, height: 1000 },
});

// F05 section 10, section 6 before M5 (D-241): the list stays, saving waits.
test("offline, the list stays with as of, and Add and Edit say they cannot save", async ({
	page,
	context,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await expect(row(page, netflix)).toBeVisible();
	await context.setOffline(true);
	try {
		await expect(page.getByText(/^as of /)).toBeVisible();
		await expect(row(page, netflix)).toBeVisible();

		const add = await openAdd(page);
		await expect(
			add.getByText("You are offline. Connect to save."),
		).toBeVisible();
		await expect(
			add.getByRole("button", { name: "Add Subscription" }),
		).toHaveAttribute("aria-disabled", "true");
		await page.keyboard.press("Escape");

		await row(page, netflix).click();
		await page.keyboard.press("e");
		const edit = dialog(page, "Edit Netflix");
		await expect(
			edit.getByText("You are offline. Connect to save."),
		).toBeVisible();
		await expect(
			edit.getByRole("button", { name: "Save changes" }),
		).toHaveAttribute("aria-disabled", "true");
		await page.keyboard.press("Escape");
	} finally {
		await context.setOffline(false);
	}
	await expect(page.getByText(/^as of /)).toBeHidden();
});

// BR-F05-51: a write with no dialog says it could not be sent, in the notice.
test("offline, S says so in the notice and nothing is skipped; online it works", async ({
	page,
	context,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await context.setOffline(true);
	try {
		await expect(page.getByText(/^as of /)).toBeVisible();
		await page.keyboard.press("s");
		await expect(
			page.getByRole("alert").filter({ hasText: "You are offline" }),
		).toBeVisible();
		await panel(page).getByRole("button", { name: "Dismiss" }).click();
	} finally {
		await context.setOffline(false);
	}
	await page.keyboard.press("s");
	await expectNotice(page, "Skipped the");
});

// BR-F05-33, D-569: Undo is tried at once and fails with the notice's message.
test("offline, Undo fails at once with the notice's message and nothing changes", async ({
	page,
	context,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("s");
	await expectNotice(page, "Skipped the");

	await context.setOffline(true);
	try {
		await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
		await expect(panel(page).getByRole("alert")).toContainText(
			"The Subscription could not be saved. Check your connection and try again.",
		);
		await expect(
			panel(page).getByRole("button", { name: "Undo", exact: true }),
		).toHaveCount(0);
		await panel(page).getByRole("button", { name: "Dismiss" }).click();
	} finally {
		await context.setOffline(false);
	}
	await expect(notice(page, "Skipped")).toHaveCount(0);
});
