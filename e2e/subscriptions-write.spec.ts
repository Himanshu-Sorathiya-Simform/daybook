import { shiftMonths } from "@/lib/time";
import { expect, test } from "./fixtures";
import {
	addSubscription,
	dialog,
	expectNotice,
	list,
	notice,
	panel,
	pickMenuItem,
	row,
	selectRow,
	short,
	today,
	userWithSubscriptions,
	withWeekday,
} from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	actionTimeout: 20_000,
	viewport: { width: 1440, height: 1000 },
});

// BR-F05-24, BR-F05-33, BR-F05-34: Add, then Undo deletes it.
test("Add a Subscription shows its notice in the panel, and Undo removes it again", async ({
	page,
}) => {
	await userWithSubscriptions(page);
	await addSubscription(page, { name: "Spotify", amount: "119" });

	const next = withWeekday(shiftMonths(today(), 1));
	await expectNotice(page, `Spotify added. Next charge ${next}.`);
	await expect(
		panel(page).getByRole("heading", { name: "Spotify" }),
	).toBeVisible();
	await expect(
		panel(page).getByRole("status").filter({ hasText: "Spotify added" }),
	).toBeVisible();
	await expect(list(page).getByRole("row", { name: /^Spotify/ })).toBeVisible();

	await notice(page, "Spotify added")
		.getByRole("button", { name: "Undo", exact: true })
		.click();
	await expect(notice(page, "Spotify added")).toHaveCount(0);
	await expect(list(page).getByRole("row", { name: /^Spotify/ })).toHaveCount(0);
	await expect(
		page.getByText("₹27,287.00 a year · 3 Subscriptions"),
	).toBeVisible();
});

// BR-F05-24, BR-F05-46, BR-F05-33: Edit, with What changes, then Undo puts the price back.
test("Edit changes the price, the notice reads it, and Undo puts the old price back", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("e");
	const edit = dialog(page, "Edit Netflix");
	const save = edit.getByRole("button", { name: "Save changes" });
	await expect(save).not.toHaveAttribute("aria-disabled", "true");
	await edit.getByRole("textbox", { name: "Amount" }).fill("799");
	await expect(edit.getByText("Was ₹649.00")).toBeVisible();
	await save.click();
	await expect(edit).toBeHidden();

	await expectNotice(
		page,
		`Netflix saved. Next charge ${withWeekday(netflix.due)}.`,
	);
	await expect(panel(page)).toContainText("₹799.00");
	await expect(row(page, netflix)).toContainText("₹799.00");

	await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
	await expect(notice(page, "Netflix saved")).toHaveCount(0);
	await expect(panel(page)).toContainText("₹649.00");
	await expect(row(page, netflix)).toContainText("₹649.00");
});

// BR-F05-26, BR-F05-27, BR-F05-33: S skips the next charge; Undo brings it back.
test("S skips the next charge, the notice names its date, and Undo brings it back", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("s");
	await expectNotice(page, `Skipped the ${short(netflix.due)} Netflix charge.`);
	// The next charge moves a month on.
	await expect(row(page, netflix)).toContainText(
		withWeekday(shiftMonths(netflix.due, 1)),
	);
	await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
	await expect(notice(page, "Skipped the")).toHaveCount(0);
	await expect(row(page, netflix)).toContainText(withWeekday(netflix.due));
});

// BR-F05-27: Undo skip on the timeline, and Undo of that.
test("Undo skip on the timeline says the charge is back, and its Undo skips it again", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("s");
	await expectNotice(page, "Skipped the");
	await panel(page).getByRole("button", { name: "Undo skip" }).click();
	await expectNotice(page, `The ${short(netflix.due)} Netflix charge is back.`);
	await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
	await expect(row(page, netflix)).toContainText(
		withWeekday(shiftMonths(netflix.due, 1)),
	);
});

// BR-F05-12, BR-F05-41, BR-F05-34: Cancel now, Undo.
test("Cancel now moves it to Ended, and Undo brings it back to its group", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("c");
	const cancel = dialog(page, "Cancel Netflix?");
	await expect(cancel.getByText("When does it end?")).toBeVisible();
	const confirm = cancel.getByRole("button", { name: "Cancel Netflix" });
	await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
	await confirm.click();
	await expect(cancel).toBeHidden();

	await expectNotice(page, "Netflix cancelled. Earlier charges stay.");
	await expect(page.getByRole("button", { name: "Ended · 2" })).toBeVisible();
	await expect(page.getByText("₹27,287.00 a year · 3 Subscriptions")).toHaveCount(
		0,
	);

	await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
	await expect(notice(page, "cancelled")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Ended · 1" })).toBeVisible();
	await expect(row(page, netflix)).toBeVisible();
	await expect(
		page.getByText("₹27,287.00 a year · 3 Subscriptions"),
	).toBeVisible();
});

// BR-F05-28, BR-F05-29, BR-F05-43: Pause, Resume now, and Undo of Resume now.
test("Pause, then Resume now, then Undo puts the pause back", async ({ page }) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("p");
	const pause = dialog(page, "Pause Netflix");
	await pause.getByRole("button", { name: /^Pause until / }).click();
	await expect(pause).toBeHidden();
	await expectNotice(page, /^Netflix paused\. Charges resume on /);
	await expect(row(page, netflix)).toContainText("Paused");

	await page.keyboard.press("r");
	await expectNotice(page, /^Netflix resumed\. Next charge /);
	await expect(row(page, netflix)).not.toContainText("Paused");

	await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
	await expect(row(page, netflix)).toContainText("Paused");
});

// BR-F05-13, BR-F05-42: Resume an ended Subscription.
test("Resume brings an ended Subscription back to its group, and Undo ends it again", async ({
	page,
}) => {
	const { old } = await userWithSubscriptions(page);
	await page.getByRole("button", { name: "Ended · 1" }).click();
	await row(page, old).click();
	await page.keyboard.press("r");
	const resume = dialog(page, "Resume Old Plan?");
	const confirm = resume.getByRole("button", { name: "Resume Old Plan" });
	await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
	await confirm.click();
	await expect(resume).toBeHidden();
	await expectNotice(page, /^Old Plan resumed\./);
	await expect(page.getByRole("button", { name: /^Ended/ })).toHaveCount(0);

	await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
	await expect(page.getByRole("button", { name: "Ended · 1" })).toBeVisible();
});

// BR-F05-14, BR-F05-44, D-590: Delete keeps its charges, and has no Undo.
test("Delete shows a Dismiss-only notice above the list, clears the selection, and its charges stay", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("Delete");
	const confirm = page.getByRole("alertdialog", { name: "Delete Netflix?" });
	await expect(
		confirm.getByText(
			"Its 2 charges stay in Transactions as ordinary expenses.",
		),
	).toBeVisible();
	await confirm.getByRole("button", { name: "Delete Netflix" }).click();

	const gone = notice(page, "Netflix deleted. Its charges stay in Transactions.");
	await expect(gone).toBeVisible();
	await expect(
		gone.getByRole("button", { name: "Undo", exact: true }),
	).toHaveCount(0);
	await expect(gone.getByRole("button", { name: "Dismiss" })).toBeVisible();
	await expect(
		panel(page).getByRole("status").filter({ hasText: "deleted" }),
	).toHaveCount(0);
	await expect(panel(page)).toContainText("Monthly cost by category");
	await expect(row(page, netflix)).toHaveCount(0);

	await gone.getByRole("button", { name: "Dismiss" }).click();
	await expect(gone).toHaveCount(0);

	// The charges are still there, as ordinary expenses.
	await page.goto("/transactions");
	await expect(page.getByRole("row", { name: /^Netflix/ }).first()).toBeVisible();
});

// BR-F05-33: where the notice lives and how long.
test("the notice moves above the list when another Subscription is selected, and the next write replaces it", async ({
	page,
}) => {
	const { netflix, gym } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("s");
	const skipped = notice(page, "Skipped the");
	await expect(panel(page).locator(skipped)).toBeVisible();

	await row(page, gym).click();
	await expect(skipped).toBeVisible();
	await expect(panel(page).locator(skipped)).toHaveCount(0);
	await selectRow(page, netflix);
	await expect(panel(page).locator(skipped)).toBeVisible();

	await pickMenuItem(page, gym, /^Skip the /);
	await expectNotice(page, "Cult Gym charge.");
	await expect(notice(page, "Netflix charge.")).toHaveCount(0);
});

// BR-F05-24, BR-F05-46: Save with no change only closes.
test("Edit with nothing changed closes with no notice", async ({ page }) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await page.keyboard.press("e");
	const edit = dialog(page, "Edit Netflix");
	const save = edit.getByRole("button", { name: "Save changes" });
	await expect(save).not.toHaveAttribute("aria-disabled", "true");
	await save.click();
	await expect(edit).toBeHidden();
	await expect(page.getByRole("status").filter({ hasText: "saved" })).toHaveCount(
		0,
	);
});
