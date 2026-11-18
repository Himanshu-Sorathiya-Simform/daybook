import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import { currentMonth, monthAfter, panel, row } from "./budgets";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

const historyLength = (page: import("@playwright/test").Page) =>
	page.evaluate(() => window.history.length);

// BR-F04-14, D-566: the month is the URL's, and every change of month is one history entry.
test("each month shown is one history entry, and Back and Forward move between them", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
	const before = await historyLength(page);
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(page).toHaveURL(/\?month=2026-09$/);
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(page).toHaveURL(/\?month=2026-08$/);
	expect(await historyLength(page)).toBe(before + 2);

	await page.goBack();
	await expect(page).toHaveURL(/\?month=2026-09$/);
	await expect(page.getByRole("button", { name: "September 2026" })).toBeVisible();
	await expect(page.getByText("Needs attention · 2")).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/\?month=2026-10$/);
	await page.goForward();
	await expect(page).toHaveURL(/\?month=2026-09$/);
});

// BR-F04-14: a reload keeps the month; the current month is the page with no month.
test("a reload keeps the month, and This month goes back to the page with no month", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-09");
	await page.reload();
	await expect(page.getByRole("button", { name: "September 2026" })).toBeVisible();
	await expect(page.getByText("Needs attention · 2")).toBeVisible();

	await page.getByRole("button", { name: "September 2026" }).click();
	await page
		.getByRole("button", { name: "This month", exact: true })
		.last()
		.click();
	await expect(page).toHaveURL(/\/budgets$/);
	await expect(page.getByRole("button", { name: /· to date$/ })).toBeVisible();
});

// BR-F04-14, D-566, FIL-5: a month that is not a month of the range is dropped, with the notice.
for (const bad of [
	["month=2026-13", "an impossible month"],
	["month=abc", "text"],
	["month=2026-1", "a month without its zero"],
	["month=", "an empty month"],
	["month=2000-01", "a month before the range"],
	["month=2099-12", "a month after the range"],
	["month=2026-10&month=2026-09", "a month given twice"],
] as const) {
	test(`a link with ${bad[1]} shows the current month with the notice, and drops it`, async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets");
		await page.goto(`/budgets?${bad[0]}`);
		await expect(
			page.getByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeVisible();
		await expect(page).toHaveURL(/\/budgets$/);
		await expect(page.getByRole("button", { name: /· to date$/ })).toBeVisible();
		await page.getByRole("button", { name: "Dismiss" }).click();
		await expect(
			page.getByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeHidden();
	});
}

// BR-F04-07, D-566: the arrows stop at the ends of the range.
test("Previous month stops 36 months back and Next month 12 months ahead", async ({
	page,
}) => {
	await userWithGolden(page, `/budgets?month=${monthAfter(-36)}`);
	await expect(
		page.getByRole("button", { name: "Previous month" }),
	).toBeDisabled();
	await expect(page.getByRole("button", { name: "Next month" })).toBeEnabled();

	await page.goto(`/budgets?month=${monthAfter(12)}`);
	await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();
	await expect(page.getByRole("button", { name: "Previous month" })).toBeEnabled();
	expect(monthAfter(12) > currentMonth()).toBe(true);
});

// BR-F04-31, AC-F04-26: the filter belongs to its month.
test("a state filter is dropped when the month changes", async ({ page }) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await page.getByRole("button", { name: /^Over budget/ }).click();
	await expect(page.getByText("Showing", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(page.getByText("Needs attention · 2")).toBeVisible();
	await expect(page.getByText("Showing", { exact: true })).toBeHidden();
	await page.goBack();
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
	await expect(page.getByText("Showing", { exact: true })).toBeHidden();
});

// BR-F04-17, AC-F04-29, D-249: the selection stays while its category shows in the new month.
test("a selection stays in a month that shows its category and clears in one that does not", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await expect(panel(page)).toContainText("Where it went in October");
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(row(page, "budget:food")).toHaveAttribute("aria-selected", "true");
	await expect(panel(page)).toContainText("Where it went in September");

	// Housing has spending in October and September, and neither spending nor a Budget in August.
	await page.goto("/budgets?month=2026-10");
	await row(page, "unbudgeted:housing").click();
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(row(page, "unbudgeted:housing")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(page.getByText("No Budgets for August 2026.")).toBeVisible();
	await expect(panel(page)).toContainText("Compared with July");
});
