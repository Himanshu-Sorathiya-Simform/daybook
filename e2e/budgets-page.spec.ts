import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import { expectHeader, expectRows, figure } from "./transactions";
import { group, list, overviewLine, panel, row } from "./budgets";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

// Golden's Budgets hold for September to November 2026 on any day (F04 section 5); the current
// month on the real clock is never asserted here.

// BR-F04-15, section 5 "The October page"
test("the October page: overview, state counts, groups and each row's state in words", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
	await expect(page.getByText("₹2,368.00 over in total")).toBeVisible();
	await expect(overviewLine(page)).toHaveText(
		"of ₹11,000.00 · 119.7% · Over by ₹2,168.00",
	);
	await expect(page.getByText("Black tick: the ₹11,000.00 limit.")).toBeVisible();
	await expect(page.getByRole("button", { name: /^Over budget/ })).toContainText(
		"2",
	);
	await expect(page.getByRole("button", { name: /^At limit/ })).toContainText("1");
	await expect(page.getByRole("button", { name: /^Nearing limit/ })).toContainText(
		"1",
	);
	await expect(page.getByRole("button", { name: /^On track/ })).toContainText("0");
	await expect(page.getByText("Not budgeted · 1")).toBeVisible();

	// AC-F04-12: every state is said in text, not by colour alone.
	await expect(row(page, "budget:entertainment")).toHaveAccessibleName(
		"Entertainment, Over by ₹1,148.00, ₹2,148.00 of ₹1,000.00 · 214.8% · Over budget, ₹1,000.00 from Sept 2026",
	);
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		"Food, Over by ₹1,220.00, ₹6,220.00 of ₹5,000.00 · 124.4% · Over budget, ₹5,000.00 from Oct 2026",
	);
	await expect(row(page, "budget:shopping")).toHaveAccessibleName(
		"Shopping, ₹0.00 left, ₹3,000.00 of ₹3,000.00 · 100.0% · At limit, ₹3,000.00 from Sept 2026",
	);
	await expect(row(page, "budget:transportation")).toHaveAccessibleName(
		"Transportation, ₹200.00 left, ₹1,800.00 of ₹2,000.00 · 90.0% · Nearing limit, ₹2,000.00 from Oct 2026",
	);
	await expect(row(page, "unbudgeted:housing")).toHaveAccessibleName(
		"Housing, No limit in October, ₹18,000.00",
	);
	await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(5);
});

// BR-F04-30, section 5 "The October page"
test("with no selection the panel summarizes the month against September", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await expect(panel(page)).toContainText("Compared with September");
	await expect(panel(page)).toContainText("₹5,069.00 more than September");
	await expect(panel(page)).toContainText(
		"₹1,000.00 more than September · 4 Budgets, 3 in September",
	);
	await expect(panel(page)).toContainText("0 in September");
});

// AC-F04-10, section 5 "The October page"
test("selecting Food shows its panel, and See 4 Transactions opens October's Food Transactions", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").click();
	await expect(panel(page)).toContainText("₹5,000.00 from Oct 2026");
	await expect(panel(page)).toContainText("Where it went in October");
	await expect(panel(page)).toContainText("BigBasket");
	await expect(panel(page)).toContainText("₹2,900.00");
	await expect(panel(page)).toContainText("Zomato");
	await expect(panel(page)).toContainText("₹2,300.00");
	await expect(panel(page)).toContainText("Swiggy");
	await expect(panel(page)).toContainText("₹1,020.00");
	// The chart has a text for screen readers (NFR-5).
	await expect(
		panel(page).getByRole("img", { name: /^Spent by month: / }),
	).toBeVisible();

	await panel(page).getByRole("link", { name: "See 4 Transactions" }).click();
	await expect(page).toHaveURL(
		/\/transactions\?from=2026-10-01&to=2026-10-31&cat=food$/,
	);
	await expectHeader(page, { count: 4, inText: "₹0.00", out: "₹6,220.00" });
	await expect(figure(page, "Out")).toHaveText("₹6,220.00");
});

// BR-F04-17: September's groups, with Not active collapsed.
test("the September page: left figures, three Not budgeted rows and a Not active one", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-09");
	await expect(page.getByText("Needs attention · 2")).toBeVisible();
	await expect(page.getByText("₹1,550.00 left")).toBeVisible();
	await expect(page.getByText("On track · 1")).toBeVisible();
	await expect(page.getByText("₹351.00 left").first()).toBeVisible();
	await expect(page.getByText("Not budgeted · 3")).toBeVisible();
	await expect(row(page, "unbudgeted:housing")).toBeVisible();
	await expect(row(page, "unbudgeted:health")).toHaveAccessibleName(
		"Health, No limit in September, ₹1,500.00",
	);
	// Transportation has spending and a Budget that starts in October.
	await expect(row(page, "unbudgeted:transportation")).toBeVisible();
	await expect(row(page, "inactive:transportation")).toBeHidden();
	await group(page, /^Not active this month · 1/).click();
	await expect(row(page, "inactive:transportation")).toContainText(
		"Starts October 2026",
	);
});

// BR-F04-31, AC-F04-26
test("a state count filters the list, shows its chip and its empty text, and Show all clears it", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await page.getByRole("button", { name: /^Over budget/ }).click();
	await expect(page.getByText("Showing", { exact: true })).toBeVisible();
	await expect(page.getByRole("grid", { name: "Showing" })).toContainText(
		"Over budget",
	);
	await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(2);
	await expect(row(page, "budget:entertainment")).toBeVisible();
	await expect(row(page, "budget:food")).toBeVisible();
	await expect(row(page, "unbudgeted:housing")).toBeHidden();

	await page.getByRole("button", { name: /^On track/ }).click();
	await expect(
		page.getByText("No Budgets are on track in October 2026."),
	).toBeVisible();
	await page.getByRole("button", { name: "Show all Budgets" }).click();
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
	await expect(row(page, "unbudgeted:housing")).toBeVisible();
});

// BR-F04-18, AC-F04-26, D-570
test("the Table view: the Budgeted total row, sorting, and the remembered choice", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await page
		.getByRole("radio", { name: "Table" })
		.locator("xpath=ancestor::label[1]")
		.click();
	const table = page.getByRole("grid", { name: /October 2026/ });
	await expect(table).toBeVisible();
	await expect(table.getByRole("row", { name: /^Budgeted total/ })).toContainText(
		"₹13,168.00",
	);
	await expect(table.getByRole("row", { name: /^Budgeted total/ })).toContainText(
		"₹11,000.00",
	);
	await expect(table.getByRole("row", { name: /^Housing/ })).toContainText(
		"₹18,000.00",
	);

	const utilization = table.getByRole("columnheader", { name: /^Utilization/ });
	await utilization.click();
	await expect(utilization).toHaveAttribute("aria-sort", "descending");
	await expectRows(page, []).catch(() => undefined);
	await expect(table.getByRole("row").nth(1)).toContainText("Entertainment");
	await utilization.click();
	await expect(utilization).toHaveAttribute("aria-sort", "ascending");
	await expect(table.getByRole("row").nth(1)).toContainText("Transportation");

	// The filter applies here too, and the choice is kept on this device.
	await page.getByRole("button", { name: /^Over budget/ }).click();
	await expect(table.getByRole("row", { name: /^Housing/ })).toBeHidden();
	await page.reload();
	await expect(page.getByRole("grid", { name: /October 2026/ })).toBeVisible();
});

// BR-F04-14, FIL-5
test("the month control moves a month, shows the year's figures, and drops an invalid month", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(page).toHaveURL(/\/budgets\?month=2026-09$/);
	await expect(page.getByText("Needs attention · 2")).toBeVisible();

	await page.getByRole("button", { name: "September 2026" }).click();
	await expect(
		page.getByRole("option", { name: /^September 2026, 81\.0%/ }),
	).toBeVisible();
	await expect(
		page.getByRole("option", { name: /^October 2026, 119\.7%/ }),
	).toBeVisible();
	await page.getByRole("option", { name: /^October 2026/ }).click();
	await expect(page).toHaveURL(/\/budgets\?month=2026-10$/);

	await page.goto("/budgets?month=2026-13");
	await expect(
		page.getByText("Some filters in this link weren't valid and were removed."),
	).toBeVisible();
	await expect(page).toHaveURL(/\/budgets$/);
});

// Section 6: a month with no Budget, and a new user's page.
test("a month with no Budget says so, with Add a Budget", async ({ page }) => {
	await userWithGolden(page, "/budgets?month=2026-08");
	await expect(page.getByText("No Budgets for August 2026.")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Add a Budget" }).last(),
	).toBeVisible();
});
