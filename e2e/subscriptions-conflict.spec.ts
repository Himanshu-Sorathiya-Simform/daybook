import { expect, test } from "./fixtures";
import {
	addSubscription,
	conflictView,
	dialog,
	expectNotice,
	notice,
	panel,
	pickMenuItem,
	renameIn,
	row,
	secondWindow,
	selectRow,
	short,
	userWithSubscriptions,
} from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	actionTimeout: 20_000,
	viewport: { width: 1440, height: 1000 },
});

// BR-F05-34, AC-F05-54: Undo that meets another window's change.
test.describe("Undo meets a Subscription another window changed", () => {
	async function undoMeetsConflict(
		page: import("@playwright/test").Page,
		context: import("@playwright/test").BrowserContext,
	) {
		const data = await userWithSubscriptions(page);
		const { netflix } = data;
		await selectRow(page, netflix);
		await page.keyboard.press("e");
		const edit = dialog(page, "Edit Netflix");
		await expect(
			edit.getByRole("button", { name: "Save changes" }),
		).not.toHaveAttribute("aria-disabled", "true");
		await edit.getByRole("textbox", { name: "Amount" }).fill("799");
		await edit.getByRole("button", { name: "Save changes" }).click();
		await expectNotice(page, "Netflix saved.");
		const other = await secondWindow(context);
		await renameIn(other, netflix, "Netflix HD");
		await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
		await expect(conflictView(page)).toBeVisible();
		return data;
	}

	test("the view lists the nine values, marks the one that differs, and says what Keep mine does", async ({
		page,
		context,
	}) => {
		await undoMeetsConflict(page, context);
		const view = conflictView(page);
		for (const label of [
			"Name",
			"Amount",
			"How often",
			"Category",
			"Started on",
			"Ends",
			"Pause",
			"Note",
			"Skipped",
		]) {
			await expect(
				view.getByRole("rowheader", { name: new RegExp(`^${label}`) }),
			).toBeVisible();
		}
		// Undo would put ₹649.00 over the renamed Subscription, so only the Amount row differs.
		await expect(view.getByText("Differs")).toHaveCount(1);
		await expect(view.getByRole("rowheader", { name: /^Amount/ })).toContainText(
			"Differs",
		);
		await expect(
			view.getByText(
				"Keep mine puts the Subscription back as it was before your change.",
			),
		).toBeVisible();
		// The notice waits under the view.
		await expect(notice(page, "Netflix saved.")).toBeAttached();
	});

	test("Keep mine puts the price back and keeps the other window's name", async ({
		page,
		context,
	}) => {
		const { netflix } = await undoMeetsConflict(page, context);
		await conflictView(page).getByRole("button", { name: "Keep mine" }).click();
		await expect(conflictView(page)).toBeHidden();
		await expect(notice(page, "Netflix saved.")).toHaveCount(0);
		await expect(panel(page)).toContainText("₹649.00");
		await expect(
			panel(page).getByRole("heading", { name: "Netflix HD" }),
		).toBeVisible();
		void netflix;
	});

	test("Keep theirs ends the notice and sends nothing", async ({
		page,
		context,
	}) => {
		await undoMeetsConflict(page, context);
		const writes: string[] = [];
		page.on("request", (request) => {
			if (request.method() !== "GET")
				writes.push(`${request.method()} ${request.url()}`);
		});
		await conflictView(page)
			.getByRole("button", { name: "Keep theirs" })
			.click();
		await expect(conflictView(page)).toBeHidden();
		await expect(notice(page, "Netflix saved.")).toHaveCount(0);
		expect(writes).toEqual([]);
		await expect(panel(page)).toContainText("₹799.00");
	});

	test("Escape leaves the notice, and pressing Undo again meets the conflict again", async ({
		page,
		context,
	}) => {
		await undoMeetsConflict(page, context);
		await page.keyboard.press("Escape");
		await expect(conflictView(page)).toBeHidden();
		await expect(notice(page, "Netflix saved.")).toBeVisible();
		await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
		await expect(conflictView(page)).toBeVisible();
	});

	test("the page's keys rest behind the view", async ({ page, context }) => {
		await undoMeetsConflict(page, context);
		await page.keyboard.press("s");
		await page.keyboard.press("p");
		await page.keyboard.press("Delete");
		await expect(dialog(page, "Pause Netflix")).toHaveCount(0);
		await expect(page.getByRole("alertdialog")).toHaveCount(0);
	});
});

// BR-F05-34: the Undo of an Add needs version 1.
test("the Undo of an Add that was changed meanwhile offers Delete anyway and Keep it", async ({
	page,
	context,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await addSubscription(page, { name: "Spotify", amount: "119" });
	await expectNotice(page, "Spotify added.");

	const other = await secondWindow(context);
	const spotify = other.getByRole("row", { name: /^Spotify/ });
	await spotify.click();
	await other
		.getByRole("complementary", { name: "Subscription" })
		.getByRole("button", { name: "Edit" })
		.click();
	const edit = dialog(other, "Edit Spotify");
	await expect(
		edit.getByRole("button", { name: "Save changes" }),
	).not.toHaveAttribute("aria-disabled", "true");
	await edit.getByRole("textbox", { name: "Amount" }).fill("129");
	await edit.getByRole("button", { name: "Save changes" }).click();
	await expect(edit).toBeHidden();

	await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
	const view = conflictView(page);
	await expect(view).toBeVisible();
	await expect(
		view.getByText("Its charges stay in Transactions as ordinary expenses."),
	).toBeVisible();
	await expect(view.getByRole("button", { name: "Keep it" })).toBeVisible();
	await view.getByRole("button", { name: "Delete anyway" }).click();
	await expect(page.getByRole("row", { name: /^Spotify/ })).toHaveCount(0);
	void netflix;
});

// BR-F05-51: a dialog's save that meets another window's change.
test.describe("a save meets a Subscription another window changed", () => {
	async function staleEdit(
		page: import("@playwright/test").Page,
		context: import("@playwright/test").BrowserContext,
	) {
		const data = await userWithSubscriptions(page);
		await selectRow(page, data.netflix);
		await page.keyboard.press("e");
		const edit = dialog(page, "Edit Netflix");
		await expect(
			edit.getByRole("button", { name: "Save changes" }),
		).not.toHaveAttribute("aria-disabled", "true");
		const other = await secondWindow(context);
		await renameIn(other, data.netflix, "Netflix HD");
		await edit.getByRole("textbox", { name: "Amount" }).fill("799");
		await edit.getByRole("button", { name: "Save changes" }).click();
		await expect(conflictView(page)).toBeVisible();
		return { ...data, edit };
	}

	test("the view shows only what the user changed as differing; Keep mine saves on top of the other change", async ({
		page,
		context,
	}) => {
		const { edit } = await staleEdit(page, context);
		await expect(conflictView(page).getByText("Differs")).toHaveCount(1);
		await conflictView(page).getByRole("button", { name: "Keep mine" }).click();
		await expect(conflictView(page)).toBeHidden();
		await expect(edit).toBeHidden();
		await expectNotice(page, /^Netflix HD saved\./);
		await expect(panel(page)).toContainText("₹799.00");
		await expect(
			panel(page).getByRole("heading", { name: "Netflix HD" }),
		).toBeVisible();
	});

	test("Keep theirs closes the dialog and shows what is saved", async ({
		page,
		context,
	}) => {
		const { edit } = await staleEdit(page, context);
		await conflictView(page)
			.getByRole("button", { name: "Keep theirs" })
			.click();
		await expect(edit).toBeHidden();
		await expect(
			page.getByRole("status").filter({ hasText: "saved" }),
		).toHaveCount(0);
		await expect(page.getByRole("row", { name: /^Netflix HD/ })).toBeVisible();
	});

	test("Escape from the view returns to the dialog with its values", async ({
		page,
		context,
	}) => {
		const { edit } = await staleEdit(page, context);
		await page.keyboard.press("Escape");
		await expect(conflictView(page)).toBeHidden();
		await expect(edit).toBeVisible();
		await expect(edit.getByRole("textbox", { name: "Amount" })).toHaveValue(
			"799.00",
		);
	});
});

// BR-F05-51: Skip and Delete against a changed Subscription.
test("S meets another window's change: Keep mine skips it against the saved version", async ({
	page,
	context,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await selectRow(page, netflix);
	const other = await secondWindow(context);
	await renameIn(other, netflix, "Netflix HD");
	await page.keyboard.press("s");
	await expect(conflictView(page)).toBeVisible();
	await conflictView(page).getByRole("button", { name: "Keep mine" }).click();
	await expectNotice(page, `Skipped the ${short(netflix.due)} Netflix HD charge.`);
});

test("Delete meets another window's change: Delete anyway deletes it, Keep it does not", async ({
	page,
	context,
}) => {
	const { netflix, gym } = await userWithSubscriptions(page);
	await pickMenuItem(page, netflix, "Delete");
	const confirm = page.getByRole("alertdialog", { name: "Delete Netflix?" });
	const other = await secondWindow(context);
	await renameIn(other, netflix, "Netflix HD");
	await confirm.getByRole("button", { name: "Delete Netflix" }).click();
	const view = conflictView(page);
	await expect(view).toBeVisible();
	await expect(
		view.getByText(
			"It changed after you chose to delete it. Delete it anyway, or keep it as it is saved now.",
		),
	).toBeVisible();
	await view.getByRole("button", { name: "Keep it" }).click();
	await expect(confirm).toBeHidden();
	await expect(page.getByRole("row", { name: /^Netflix HD/ })).toBeVisible();

	await pickMenuItem(page, gym, "Delete");
	const again = page.getByRole("alertdialog", { name: "Delete Cult Gym?" });
	await renameIn(other, gym, "Cult Gym Pro");
	await again.getByRole("button", { name: "Delete Cult Gym" }).click();
	await conflictView(page).getByRole("button", { name: "Delete anyway" }).click();
	await expectNotice(page, "Cult Gym Pro deleted.");
	await expect(page.getByRole("row", { name: /^Cult Gym/ })).toHaveCount(0);
});

// BR-F05-33: a Subscription deleted in another window.
test("Undo of a change to a Subscription deleted elsewhere reads that it was deleted", async ({
	page,
	context,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await selectRow(page, netflix);
	await page.keyboard.press("e");
	const edit = dialog(page, "Edit Netflix");
	await expect(
		edit.getByRole("button", { name: "Save changes" }),
	).not.toHaveAttribute("aria-disabled", "true");
	await edit.getByRole("textbox", { name: "Amount" }).fill("799");
	await edit.getByRole("button", { name: "Save changes" }).click();
	await expectNotice(page, "Netflix saved.");

	const other = await secondWindow(context);
	await pickMenuItem(other, netflix, "Delete");
	await other
		.getByRole("alertdialog")
		.getByRole("button", { name: "Delete Netflix" })
		.click();
	await expect(other.getByRole("row", { name: /^Netflix/ })).toHaveCount(0);

	await panel(page).getByRole("button", { name: "Undo", exact: true }).click();
	await expect(
		page.getByRole("alert").filter({ hasText: "deleted on another device" }),
	).toBeVisible();
	await expect(row(page, netflix)).toHaveCount(0);
});
