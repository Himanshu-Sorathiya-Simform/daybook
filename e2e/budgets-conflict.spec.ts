import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import {
	changeFoodFromNow,
	chooseOption,
	conflictView,
	currentMonth,
	dialog,
	expectNotice,
	limitBox,
	longMonth,
	monthName,
	panel,
	row,
	secondWindow,
	selectRow,
} from "./budgets";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

const CHANGED = (limit: string) =>
	`Food limit is now ₹${limit} from ${longMonth(currentMonth())}.`;

// BR-F04-23, AC-F04-25, AC-F04-30: Undo that meets another window's change.
test.describe("Undo meets a Budget another window changed", () => {
	async function undoMeetsConflict(
		page: import("@playwright/test").Page,
		context: import("@playwright/test").BrowserContext,
	) {
		await userWithGolden(page, "/budgets?month=2026-10");
		await changeFoodFromNow(page, "7000");
		await expectNotice(page, CHANGED("7,000.00"));
		const other = await secondWindow(context, "/budgets?month=2026-10");
		await changeFoodFromNow(other, "5500");
		await panel(page).getByRole("button", { name: "Undo" }).click();
		await expect(conflictView(page)).toBeVisible();
	}

	test("the view says what Keep mine does, and Keep mine puts the Budget back as it was", async ({
		page,
		context,
	}) => {
		await undoMeetsConflict(page, context);
		await expect(
			conflictView(page).getByText(
				"Keep mine puts the Budget back as it was before your change.",
			),
		).toBeVisible();
		// The notice stays under the view until a choice is made.
		await expect(page.getByText(CHANGED("7,000.00"))).toBeAttached();
		const requests: string[] = [];
		page.on("request", (request) => {
			if (request.method() === "PATCH") requests.push(request.url());
		});
		await conflictView(page).getByRole("button", { name: "Keep mine" }).click();
		await expect(conflictView(page)).toBeHidden();
		await expect(page.getByText(CHANGED("7,000.00"))).toHaveCount(0);
		expect(requests).toHaveLength(1);
		// The Budget is as it was before the change: October's 5,000.00 and no entry for now.
		await expect(
			panel(page).getByRole("region", { name: "Limit history" }),
		).not.toContainText("₹7,000.00");
	});

	test("Keep theirs ends the notice and sends nothing", async ({
		page,
		context,
	}) => {
		await undoMeetsConflict(page, context);
		const requests: string[] = [];
		page.on("request", (request) => {
			if (request.method() !== "GET")
				requests.push(`${request.method()} ${request.url()}`);
		});
		await conflictView(page)
			.getByRole("button", { name: "Keep theirs" })
			.click();
		await expect(conflictView(page)).toBeHidden();
		await expect(page.getByText(CHANGED("7,000.00"))).toHaveCount(0);
		expect(requests).toEqual([]);
		await expect(
			panel(page).getByRole("region", { name: "Limit history" }),
		).toContainText("₹5,500.00 from");
	});

	test("Escape leaves the notice, and pressing Undo again meets the conflict again", async ({
		page,
		context,
	}) => {
		await undoMeetsConflict(page, context);
		await page.keyboard.press("Escape");
		await expect(conflictView(page)).toBeHidden();
		await expect(page.getByText(CHANGED("7,000.00"))).toBeVisible();
		await panel(page).getByRole("button", { name: "Undo" }).click();
		await expect(conflictView(page)).toBeVisible();
	});

	test("the page's keys rest behind the view", async ({ page, context }) => {
		await undoMeetsConflict(page, context);
		await page.keyboard.press("s");
		await page.keyboard.press("l");
		await page.keyboard.press("Delete");
		await expect(dialog(page, "Stop budgeting Food")).toHaveCount(0);
		await expect(dialog(page, "Change the Food limit")).toHaveCount(0);
		await expect(page.getByRole("alertdialog")).toHaveCount(0);
	});
});

// BR-F04-23: a delete that meets another window's change.
test.describe("Delete meets a Budget another window changed", () => {
	test("the view offers Delete anyway and Keep it; Delete anyway deletes the saved Budget", async ({
		page,
		context,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await row(page, "budget:food").click();
		await panel(page).getByRole("button", { name: "Delete" }).click();
		const confirm = page.getByRole("alertdialog", {
			name: "Delete the Food Budget?",
		});
		const other = await secondWindow(context, "/budgets?month=2026-10");
		await changeFoodFromNow(other, "5500");

		await confirm.getByRole("button", { name: "Delete Budget" }).click();
		await expect(conflictView(page)).toBeVisible();
		await expect(
			conflictView(page).getByText(
				"It changed after you chose to delete it. Delete it anyway, or keep it as it is saved now.",
			),
		).toBeVisible();
		await expect(
			conflictView(page).getByRole("button", { name: "Keep it" }),
		).toBeVisible();
		await conflictView(page)
			.getByRole("button", { name: "Delete anyway" })
			.click();
		await expect(conflictView(page)).toBeHidden();
		await expectNotice(page, "Food Budget deleted.");
		await expect(row(page, "budget:food")).toHaveCount(0);
	});

	test("Keep it keeps the Budget as the other window saved it", async ({
		page,
		context,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await row(page, "budget:food").click();
		await panel(page).getByRole("button", { name: "Delete" }).click();
		const confirm = page.getByRole("alertdialog", {
			name: "Delete the Food Budget?",
		});
		const other = await secondWindow(context, "/budgets?month=2026-10");
		await changeFoodFromNow(other, "5500");
		await confirm.getByRole("button", { name: "Delete Budget" }).click();
		await conflictView(page).getByRole("button", { name: "Keep it" }).click();
		await expect(conflictView(page)).toBeHidden();
		await expect(confirm).toBeHidden();
		await expect(row(page, "budget:food")).toBeVisible();
		await expect(page.getByRole("status")).toHaveCount(0);
		await selectRow(page, "budget:food");
		await expect(
			panel(page).getByRole("region", { name: "Limit history" }),
		).toContainText("₹5,500.00 from");
	});
});

// BR-F04-23, BR-F04-25: Remove that meets another window's change.
test("a Remove that meets another window's change opens the view, and Keep mine removes the one-month limit", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await panel(page).getByRole("button", { name: "Change limit" }).click();
	const change = dialog(page, "Change the Food limit");
	await limitBox(change).fill("8000");
	await chooseOption(change, "One month only");
	await change.getByRole("radio", { name: "October (viewing)" }).click();
	await change.getByRole("button", { name: "Change October only" }).click();
	await expect(change).toBeHidden();
	await expectNotice(page, "Food limit is ₹8,000.00 for October 2026 only.");

	const other = await secondWindow(context, "/budgets?month=2026-10");
	await changeFoodFromNow(other, "5500");

	await panel(page)
		.getByRole("button", { name: "Remove ₹8,000.00 in Oct 2026 only" })
		.click();
	await expect(conflictView(page)).toBeVisible();
	await expect(
		conflictView(page).getByText(
			"Keep mine applies your change, the removal of the one-month limit for October 2026, to the saved Budget.",
		),
	).toBeVisible();
	await conflictView(page).getByRole("button", { name: "Keep mine" }).click();
	await expect(conflictView(page)).toBeHidden();
	await expectNotice(page, "One-month limit for October 2026 removed.");
	await expect(
		panel(page).getByRole("region", { name: "Limit history" }),
	).not.toContainText("in Oct 2026 only");
});

// BR-F04-23, section 8: the other window deleted the Budget.
test("Keep mine after the other window deleted the Budget closes the view and says so in the dialog", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await panel(page).getByRole("button", { name: "Change limit" }).click();
	const mine = dialog(page, "Change the Food limit");
	const other = await secondWindow(context, "/budgets?month=2026-10");
	await changeFoodFromNow(other, "5500");

	await limitBox(mine).fill("7000");
	await mine
		.getByRole("button", { name: `Change from ${monthName(currentMonth())}` })
		.click();
	await expect(conflictView(page)).toBeVisible();

	await selectRow(other, "budget:food");
	await panel(other).getByRole("button", { name: "Delete" }).click();
	await other
		.getByRole("alertdialog")
		.getByRole("button", { name: "Delete Budget" })
		.click();
	await expectNotice(other, "Food Budget deleted.");

	await conflictView(page).getByRole("button", { name: "Keep mine" }).click();
	await expect(conflictView(page)).toBeHidden();
	await expect(
		mine.getByText("This Budget was deleted on another device."),
	).toBeVisible();
	await expect(mine).toBeVisible();
});

// BR-F04-29, section 8: an Undo for a Budget that is gone.
test("Undo after the other window deleted the Budget reads that it was deleted elsewhere", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await changeFoodFromNow(page, "7000");
	await expectNotice(page, CHANGED("7,000.00"));
	const other = await secondWindow(context, "/budgets?month=2026-10");
	await selectRow(other, "budget:food");
	await panel(other).getByRole("button", { name: "Delete" }).click();
	await other
		.getByRole("alertdialog")
		.getByRole("button", { name: "Delete Budget" })
		.click();
	await expectNotice(other, "Food Budget deleted.");

	await panel(page).getByRole("button", { name: "Undo" }).click();
	await expect(panel(page).getByRole("alert")).toHaveText(
		/This Budget was deleted on another device\./,
	);
	await expect(panel(page).getByRole("button", { name: "Undo" })).toHaveCount(0);
});
