import { randomUUID } from "node:crypto";

import { type Page } from "@playwright/test";

import { open, userWithGolden } from "./data";
import { clientAddress, expect, test } from "./fixtures";
import { choose, control, expectHeader, query, requestsTo } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

// Golden check C. Its dates are no preset on any day, so the view keeps them as they are and
// the generated name never depends on the clock.
const CHECK_C = "/transactions?from=2026-09-01&to=2026-10-31&cat=shopping";

const pills = (page: Page) => page.getByRole("radiogroup", { name: "Saved views" });
const pill = (page: Page, name: RegExp | string) =>
	pills(page).getByRole("radio", { name });
const selected = (page: Page) =>
	pills(page).locator('[role="radio"][aria-checked="true"]');
const button = (page: Page, name: string) =>
	page.getByRole("button", { name, exact: true });

/** Opens the selected view's menu and picks `item`. */
async function viewMenu(page: Page, item: "Rename" | "Delete") {
	await button(page, "View options").click();
	await page.getByRole("menuitem", { name: item }).click();
}

/** Saves check C as a view and returns its id. */
async function saveCheckC(page: Page): Promise<string> {
	await button(page, "Save as view").click();
	await expect(page.getByText("Saved as a new view.")).toBeVisible();
	await expect(page).toHaveURL(/&view=[0-9a-f-]{36}$/);
	return new URL(page.url()).searchParams.get("view")!;
}

// AC-F03-54
test("with nothing edited, + Save view shows its hint and saves nothing", async ({
	page,
}) => {
	await userWithGolden(page);
	const writes = requestsTo(page, /^\/api\/transaction-views/);
	await expect(selected(page)).toHaveText("All Transactions");

	await button(page, "Save view").click();

	await expect(
		page.getByText("Change a filter, then save it as a view."),
	).toBeVisible();
	expect(writes.filter((request) => !request.startsWith("GET"))).toEqual([]);
});

// AC-F03-54, AC-F03-55, BR-F03-65 to BR-F03-69: a view's whole life.
test("save, edit, update, revert, rename and delete a view", async ({ page }) => {
	test.slow();
	await userWithGolden(page, CHECK_C);
	await expect(selected(page)).toHaveText("All Transactions · edited");
	await expect(button(page, "Revert")).toBeVisible();

	// Save as view: named from the chips, selected, and the list unchanged.
	const id = await saveCheckC(page);
	await expect(selected(page)).toHaveText(/, Shopping$/);
	await expectHeader(page, { count: 3, inText: "₹0.00", out: "₹5,400.00" });

	// An edit marks it; Update view stores it.
	await control(page, "Type").click();
	await choose(page.getByRole("dialog", { name: "Type" }), "checkbox", /^Refund/);
	await page.keyboard.press("Escape");
	await expect(selected(page)).toHaveText(/, Shopping · edited$/);
	await expect(button(page, "Save as view")).toHaveCount(0);
	await button(page, "Update view").click();
	await expect(page.getByText("View updated.")).toBeVisible();
	await expect(selected(page)).toHaveText(/, Shopping$/);

	// Revert goes back to what the view stores, with a history entry.
	await page.getByRole("button", { name: /^Group and sort/ }).click();
	await choose(page, "radio", "Largest first");
	await page.keyboard.press("Escape");
	await expect(selected(page)).toHaveText(/ · edited$/);
	await button(page, "Revert").click();
	await expect(page).toHaveURL(
		new RegExp(
			`\\?from=2026-09-01&to=2026-10-31&type=refund&cat=shopping&view=${id}$`,
		),
	);
	await expectHeader(page, { count: 1, inText: "₹0.00", out: "−₹1,500.00" });

	// Rename.
	await viewMenu(page, "Rename");
	const rename = page.getByRole("dialog", { name: "Rename view" });
	await rename.getByRole("textbox", { name: "Name" }).fill("Shopping refunds");
	await rename.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("View renamed.")).toBeVisible();
	await expect(selected(page)).toHaveText("Shopping refunds");

	// A reload keeps it selected.
	await open(page, page.url());
	await expect(selected(page)).toHaveText("Shopping refunds");

	// Delete: the filter stays, and All Transactions is selected, edited.
	await viewMenu(page, "Delete");
	const confirm = page.getByRole("alertdialog", {
		name: "Delete “Shopping refunds”?",
	});
	await expect(confirm).toContainText("Your Transactions stay as they are.");
	await confirm.getByRole("button", { name: "Delete" }).click();
	await expect(page.getByText("View deleted.")).toBeVisible();
	await expect(page).not.toHaveURL(/view=/);
	await expect(selected(page)).toHaveText("All Transactions · edited");
	await expect(pill(page, "Shopping refunds")).toHaveCount(0);
});

// BR-F03-65: choosing a view pushes history; Back goes back.
test("choosing a view and All Transactions moves through history", async ({
	page,
}) => {
	await userWithGolden(page, CHECK_C);
	const id = await saveCheckC(page);
	await pill(page, "All Transactions").click();
	await expect(page).toHaveURL(/\/transactions$/);

	await pill(page, /, Shopping$/).click();
	await expect(page).toHaveURL(new RegExp(`view=${id}$`));
	await page.goBack();
	await expect(page).toHaveURL(/\/transactions$/);
	await expect(selected(page)).toHaveText("All Transactions");
});

// AC-F03-54
test("a view id that is not the user's leaves the URL, and All Transactions is selected", async ({
	page,
}) => {
	await userWithGolden(page, `/transactions?cat=food&view=${randomUUID()}`);

	await expect(page).toHaveURL(/\?cat=food$/);
	await expect(selected(page)).toHaveText("All Transactions · edited");
});

// AC-F03-55: a 409 after a rename on another device.
test("an update after another device renamed the view says it changed", async ({
	page,
	browser,
}) => {
	await userWithGolden(page, CHECK_C);
	const id = await saveCheckC(page);
	const context = await browser.newContext({
		storageState: await page.context().storageState(),
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
		viewport: { width: 1280, height: 800 },
	});
	try {
		const other = await context.newPage();
		await open(other, `/transactions${new URL(page.url()).search}`);
		await viewMenu(other, "Rename");
		const rename = other.getByRole("dialog", { name: "Rename view" });
		await rename
			.getByRole("textbox", { name: "Name" })
			.fill("Renamed elsewhere");
		await rename.getByRole("button", { name: "Save" }).click();
		await expect(other.getByText("View renamed.")).toBeVisible();
	} finally {
		await context.close();
	}

	await page.getByRole("button", { name: /^Group and sort/ }).click();
	await choose(page, "radio", "Largest first");
	await page.keyboard.press("Escape");
	await button(page, "Update view").click();

	await expect(
		page.getByText("This view changed on another device. Try again."),
	).toBeVisible();
	// The list reloads with the new name, still selected and still edited.
	await expect(selected(page)).toHaveText("Renamed elsewhere · edited");
	expect(query(page)).toContain(`view=${id}`);
});

// AC-F03-54, BR-F03-63
test("offline, every view write is disabled with the line, and Revert still works", async ({
	page,
	context,
}) => {
	await userWithGolden(page, CHECK_C);
	await saveCheckC(page);
	await control(page, "Type").click();
	await choose(page.getByRole("dialog", { name: "Type" }), "checkbox", /^Refund/);
	await page.keyboard.press("Escape");
	await expect(selected(page)).toHaveText(/ · edited$/);

	await context.setOffline(true);
	try {
		await expect(
			page.getByText("You are offline. Connect to save."),
		).toBeVisible();
		await expect(button(page, "Update view")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await button(page, "View options").click();
		await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await page.keyboard.press("Escape");
		await button(page, "Revert").click();
		await expect(selected(page)).toHaveText(/, Shopping$/);
	} finally {
		await context.setOffline(false);
	}
});
