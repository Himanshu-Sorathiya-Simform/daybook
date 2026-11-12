import { type Browser, type Page, type Request } from "@playwright/test";

import type { LoadedGolden } from "../seed/load-golden";
import { open, userWithGolden } from "./data";
import { clientAddress, expect, test } from "./fixtures";
import {
	expectHeader,
	expectSelected,
	panel,
	row,
	rows,
	searchBox,
} from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

const CHECK_B = "/transactions?from=2026-10-01&to=2026-10-31&cat=food";
const SWIGGY_24 = /^Swiggy, Food, 10:15 pm, −₹640\.00$/;

/** Selects #24 and waits for the selection to land, so a key pressed next acts on it. */
async function selectSwiggy(page: Page) {
	await row(page, SWIGGY_24).click();
	await expectSelected(page);
}
const confirmView = (page: Page) =>
	page.getByRole("alertdialog", { name: "Delete this Transaction?" });

/** Every DELETE the page sends to a Transaction, with when it left. */
function deletesOf(page: Page) {
	const sent: { request: Request; at: number }[] = [];
	page.on("request", (request) => {
		if (
			request.method() === "DELETE"
			&& /\/api\/transactions\/[0-9a-f-]{36}$/.test(request.url())
		)
			sent.push({ request, at: Date.now() });
	});
	return sent;
}

/** #24 selected on check B, its Delete pressed and confirmed, for a new golden user unless
 * `golden` names one already set up. Returns when the confirm closed. */
async function deleteSwiggy(page: Page, given?: LoadedGolden) {
	const golden = given ?? (await userWithGolden(page)).golden;
	await open(page, `${CHECK_B}&txn=${golden.id(24)}`);
	await expect(panel(page)).toContainText("−₹640.00");
	await panel(page).getByRole("button", { name: "Delete" }).click();
	const confirm = confirmView(page);
	await expect(confirm).toContainText(
		"It leaves your list now. You can undo for 5 seconds.",
	);
	await expect(confirm).toContainText("−₹640.00");
	await confirm.getByRole("button", { name: "Delete" }).click();
	await expect(confirm).toBeHidden();
	return { golden, confirmedAt: Date.now() };
}

// AC-F03-73, BR-F03-26
test("Undo within 5 seconds brings the row back selected, and nothing is ever sent", async ({
	page,
}) => {
	const sent = deletesOf(page);
	const { golden } = await deleteSwiggy(page);

	await expect(row(page, SWIGGY_24)).toHaveCount(0);
	await expect(page.getByText("Transaction deleted.")).toBeVisible();
	await page.getByRole("button", { name: "Undo" }).click();

	await expect(row(page, SWIGGY_24)).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`txn=${golden.id(24)}$`));
	await page.waitForTimeout(7000);
	expect(sent).toEqual([]);
});

// AC-F03-73: the DELETE leaves once the window ends, at the row's version.
test("without Undo, the DELETE leaves after 5 seconds, and the row stays gone after a reload", async ({
	page,
}) => {
	const sent = deletesOf(page);
	const { golden, confirmedAt } = await deleteSwiggy(page);
	await expect(rows(page)).toHaveCount(3);

	await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
	expect(sent[0]!.at - confirmedAt).toBeGreaterThanOrEqual(4500);
	expect(sent[0]!.request.url()).toContain(golden.id(24));
	expect(await sent[0]!.request.headerValue("if-match")).toBe('"1"');
	await expectHeader(page, { count: 3, inText: "₹0.00", out: "₹5,580.00" });

	await open(page, CHECK_B);
	await expect(rows(page)).toHaveCount(3);
	await expect(row(page, SWIGGY_24)).toHaveCount(0);
});

// BR-F03-52, BR-F03-73
test("the Delete key asks first, and once confirmed by keyboard focus moves to the next row", async ({
	page,
}) => {
	await userWithGolden(page, CHECK_B);
	await selectSwiggy(page);
	await page.keyboard.press("Delete");

	const confirm = confirmView(page);
	await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(confirm.getByRole("button", { name: "Delete" })).toBeFocused();
	await page.keyboard.press("Enter");

	await expect(confirm).toBeHidden();
	await expect(row(page, /^BigBasket, Food: Monthly groceries/)).toBeFocused();
	await expect(page).not.toHaveURL(/txn=/);
});

test("Backspace in the search box only edits the search", async ({ page }) => {
	await userWithGolden(page, CHECK_B);
	await selectSwiggy(page);
	await searchBox(page).fill("swiggy");
	await page.keyboard.press("Backspace");

	await expect(searchBox(page)).toHaveValue("swigg");
	await expect(confirmView(page)).toHaveCount(0);
});

// AC-F03-73
test("the edit dialog's Delete asks over it, and Cancel returns with what was typed", async ({
	page,
}) => {
	await userWithGolden(page, CHECK_B);
	await selectSwiggy(page);
	await page.keyboard.press("e");
	const dialog = page.getByRole("dialog", { name: "Edit Transaction" });
	await dialog.getByRole("textbox", { name: "Amount" }).fill("700");
	await dialog.getByRole("button", { name: "Delete" }).click();

	await confirmView(page).getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("textbox", { name: "Amount" })).toHaveValue(
		"700.00",
	);
	await expect(row(page, SWIGGY_24)).toBeVisible();
});

async function secondDevice(browser: Browser, page: Page) {
	const context = await browser.newContext({
		storageState: await page.context().storageState(),
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
		viewport: { width: 1280, height: 800 },
		timezoneId: "Asia/Kolkata",
		locale: "en-IN",
	});
	return { context, other: await context.newPage() };
}

// AC-F03-30, BR-F03-78, D-556, D-557
test("a row changed elsewhere during the window opens the delete conflict, and Keep it brings it back", async ({
	page,
	browser,
}) => {
	test.slow();
	const { golden } = await userWithGolden(page);
	const { context, other } = await secondDevice(browser, page);
	try {
		// The other device has its edit ready, so it lands inside this device's 5 seconds.
		await open(other, `${CHECK_B}&txn=${golden.id(24)}`);
		await panel(other).getByRole("button", { name: "Edit" }).click();
		const edit = other.getByRole("dialog", { name: "Edit Transaction" });
		await edit.getByRole("textbox", { name: "Amount" }).fill("700");

		await deleteSwiggy(page, golden);
		await edit.getByRole("button", { name: "Save" }).click();
		await expect(other.getByText("Changes saved.")).toBeVisible();

		const conflict = page.getByRole("dialog", {
			name: "This Transaction changed on another device",
		});
		await expect(conflict).toBeVisible({ timeout: 15_000 });
		await expect(conflict).toContainText(
			"It changed after you deleted it. Delete it anyway, or keep it as it is saved now.",
		);
		await expect(conflict).toContainText("When you deleted it");
		await conflict.getByRole("button", { name: "Keep it" }).click();

		await expect(row(page, /^Swiggy, Food, 10:15 pm, −₹700\.00$/)).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`txn=${golden.id(24)}$`));
	} finally {
		await context.close();
	}
});

// BR-F03-26, D-556: before M5 nothing queues, so offline the delete fails at once.
test("offline when the window ends, the row comes back with the message", async ({
	page,
	context,
}) => {
	await deleteSwiggy(page);
	await context.setOffline(true);
	try {
		await expect(
			page.getByText("Couldn't delete. Check your connection and try again."),
		).toBeVisible({ timeout: 15_000 });
		await expect(row(page, SWIGGY_24)).toBeVisible();
	} finally {
		await context.setOffline(false);
	}
});
