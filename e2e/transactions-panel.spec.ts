import { randomUUID } from "node:crypto";

import { type Browser, type Page } from "@playwright/test";

import { open, userWithGolden } from "./data";
import { clientAddress, expect, test } from "./fixtures";
import {
	expectHeader,
	expectSelected,
	list,
	panel,
	query,
	requestsTo,
	row,
	rows,
} from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

const CHECK_A = "/transactions?from=2026-10-01&to=2026-10-31";
const CHECK_B = `${CHECK_A}&cat=food`;
const SWIGGY_24 = /^Swiggy, Food, 10:15 pm, −₹640\.00$/;

/** Selects #24 and waits for the selection to land, so a key pressed next acts on it. */
async function selectSwiggy(page: Page) {
	await row(page, SWIGGY_24).click();
	await expectSelected(page);
}

const historyLength = (page: Page) => page.evaluate(() => window.history.length);

test.describe("docked, from 1180 px (BR-F03-70 to BR-F03-73)", () => {
	// AC-F03-56 at M1: with nothing selected, the panel sums the list.
	test("with nothing selected, the panel sums the list", async ({ page }) => {
		await userWithGolden(page, CHECK_A);

		await expect(panel(page)).toContainText("11 Transactions");
		await expect(panel(page)).toContainText("Top payees by Out");
		await expect(panel(page)).toContainText("Out by category");
	});

	// AC-F03-58
	test("a click selects the row, writes txn by replacing, and Escape clears it", async ({
		page,
	}) => {
		const { golden } = await userWithGolden(page, CHECK_B);
		await expect(rows(page)).toHaveCount(4);
		const before = await historyLength(page);

		await selectSwiggy(page);

		await expect(page).toHaveURL(new RegExp(`&txn=${golden.id(24)}$`));
		expect(await historyLength(page)).toBe(before);
		await expect(panel(page)).toContainText("Swiggy");
		await expect(panel(page)).toContainText("−₹640.00");
		await expect(panel(page)).toContainText("Mon, 19 Oct, 2026 · 10:15 pm");
		await expect(
			panel(page).getByRole("region", { name: "Swiggy in the last 3 months" }),
		).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page).toHaveURL(new RegExp(`${CHECK_B.replace("?", "\\?")}$`));
		await expect(panel(page)).toContainText("4 Transactions");
	});

	// AC-F03-58
	test("Down and Up select the next and previous rows", async ({ page }) => {
		const { golden } = await userWithGolden(page, CHECK_B);
		await selectSwiggy(page);

		await page.keyboard.press("ArrowDown");
		await expect(page).toHaveURL(new RegExp(`txn=${golden.id(21)}$`));
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowUp");
		await expect(page).toHaveURL(new RegExp(`txn=${golden.id(25)}$`));
	});

	// AC-F03-58, BR-F03-53
	test("a txn link to a row outside the list shows it on its own", async ({
		page,
	}) => {
		const { golden } = await userWithGolden(page);
		const alone = requestsTo(page, /^\/api\/transactions\/[0-9a-f-]{36}$/);
		await open(page, `/transactions?cat=shopping&txn=${golden.id(24)}`);

		await expect(panel(page)).toContainText("−₹640.00");
		await expect(row(page, SWIGGY_24)).toHaveCount(0);
		expect(alone).toEqual([`GET /api/transactions/${golden.id(24)}`]);
	});

	// AC-F03-58
	test("a txn link to an unknown id says so and loses txn", async ({ page }) => {
		await userWithGolden(page, `/transactions?txn=${randomUUID()}`);

		await expect(
			page.getByText("We couldn't find that Transaction."),
		).toBeVisible();
		await expect(page).toHaveURL(/\/transactions$/);
	});

	// BR-F03-53
	test("new=1 opens New Transaction, and closing it removes new", async ({
		page,
	}) => {
		await userWithGolden(page, "/transactions?new=1");
		const dialog = page.getByRole("dialog", { name: "New Transaction" });
		await expect(dialog).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(page).toHaveURL(/\/transactions$/);
	});

	// BR-F03-23, AC-F03-62
	test("E opens Edit Transaction, and a saved amount reaches the row, the panel and the header", async ({
		page,
	}) => {
		await userWithGolden(page, CHECK_B);
		await selectSwiggy(page);
		await page.keyboard.press("e");

		const dialog = page.getByRole("dialog", { name: "Edit Transaction" });
		await expect(dialog.getByRole("textbox", { name: "Amount" })).toHaveValue(
			"640.00",
		);
		await dialog.getByRole("textbox", { name: "Amount" }).fill("660");
		await dialog.getByRole("button", { name: "Save" }).click();

		await expect(page.getByText("Changes saved.")).toBeVisible();
		await expect(dialog).toBeHidden();
		await expect(row(page, /^Swiggy, Food, 10:15 pm, −₹660\.00$/)).toBeVisible();
		await expect(panel(page)).toContainText("−₹660.00");
		await expectHeader(page, { count: 4, inText: "₹0.00", out: "₹6,240.00" });
	});

	// D-552
	test("Save with nothing changed closes the dialog and sends nothing", async ({
		page,
	}) => {
		await userWithGolden(page, CHECK_B);
		await selectSwiggy(page);
		const edits = requestsTo(page, /^\/api\/transactions\/[0-9a-f-]{36}$/);
		await page.keyboard.press("e");
		const dialog = page.getByRole("dialog", { name: "Edit Transaction" });
		await dialog.getByRole("button", { name: "Save" }).click();

		await expect(dialog).toBeHidden();
		await page.waitForTimeout(500);
		expect(edits.filter((request) => request.startsWith("PATCH"))).toEqual([]);
	});

	// BR-F03-28
	test("D duplicates the row, dated now, and Save adds it", async ({ page }) => {
		await userWithGolden(page);
		await expect(rows(page)).toHaveCount(22);
		await selectSwiggy(page);
		await page.keyboard.press("d");

		const dialog = page.getByRole("dialog", { name: "Duplicate Transaction" });
		await expect(dialog.getByRole("textbox", { name: "Amount" })).toHaveValue(
			"640.00",
		);
		await expect(dialog.getByRole("combobox", { name: "Payee" })).toHaveValue(
			"Swiggy",
		);
		await dialog.getByRole("button", { name: "Save", exact: true }).click();

		await expect(page.getByText("Transaction saved.")).toBeVisible();
		await expect(rows(page)).toHaveCount(23);
		await expect(rows(page).first()).toHaveAccessibleName(
			/^Swiggy, Food, .*−₹640\.00$/,
		);
	});
});

/** A second window of the same user, as another device: its own client address, the same
 * session. */
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

/** Saves `amount` on #24 from `page`'s open panel. */
async function editAmount(page: Page, amount: string) {
	await panel(page).getByRole("button", { name: "Edit" }).click();
	const dialog = page.getByRole("dialog", { name: "Edit Transaction" });
	await dialog.getByRole("textbox", { name: "Amount" }).fill(amount);
	await dialog.getByRole("button", { name: "Save" }).click();
	return dialog;
}

test.describe("the conflict view (BR-F03-24, BR-F03-78)", () => {
	for (const choice of ["Keep mine", "Keep theirs"] as const) {
		test(`a save that meets another device's change shows both; ${choice} settles it`, async ({
			page,
			browser,
		}) => {
			const { golden } = await userWithGolden(page);
			const link = `/transactions?txn=${golden.id(24)}`;
			await open(page, link);
			await expect(panel(page)).toContainText("−₹640.00");
			const { context, other } = await secondDevice(browser, page);
			try {
				await open(other, link);
				await editAmount(other, "700");
				await expect(other.getByText("Changes saved.")).toBeVisible();

				await editAmount(page, "650");
				const conflict = page.getByRole("dialog", {
					name: "This Transaction changed on another device",
				});
				await expect(conflict).toBeVisible();
				await expect(conflict).toContainText("Differs");
				await expect(conflict).toContainText("₹650.00");
				await expect(conflict).toContainText("₹700.00");

				await conflict.getByRole("button", { name: choice }).click();
				const kept = choice === "Keep mine" ? "−₹650.00" : "−₹700.00";
				await expect(conflict).toBeHidden();
				await expect(panel(page)).toContainText(kept);
				await other.reload();
				await expect(panel(other)).toContainText(kept);
			} finally {
				await context.close();
			}
		});
	}
});

test.describe("as a drawer, below 1180 px (BR-F03-70, AC-F03-72)", () => {
	test.use({ viewport: { width: 1179, height: 800 } });
	const drawer = (page: Page) =>
		page.getByRole("dialog", { name: "Transaction details" });

	test("no panel shows until a row is chosen, which opens the drawer", async ({
		page,
	}) => {
		const { golden } = await userWithGolden(page, CHECK_B);
		await expect(list(page)).toBeVisible();
		await expect(drawer(page)).toHaveCount(0);
		await expect(panel(page)).toBeHidden();

		await selectSwiggy(page);
		await expect(drawer(page)).toContainText("−₹640.00");
		await expect(page).toHaveURL(new RegExp(`txn=${golden.id(24)}$`));
	});

	for (const how of ["Close details", "Escape", "the scrim"] as const) {
		test(`${how} closes the drawer and removes txn`, async ({ page }) => {
			const { golden } = await userWithGolden(page);
			await open(page, `${CHECK_B}&txn=${golden.id(24)}`);
			await expect(drawer(page)).toContainText("−₹640.00");

			if (how === "Close details") {
				await drawer(page)
					.getByRole("button", { name: "Close details" })
					.click();
			} else if (how === "Escape") {
				await page.keyboard.press("Escape");
			} else {
				await page.mouse.click(20, 400);
			}

			await expect(drawer(page)).toHaveCount(0);
			expect(query(page)).toBe("?from=2026-10-01&to=2026-10-31&cat=food");
		});
	}
});
