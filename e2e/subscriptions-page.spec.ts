import { expect, test } from "./fixtures";
import {
	chooseView,
	list,
	panel,
	row,
	userWithNoSubscriptions,
	userWithSubscriptions,
	withWeekday,
} from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

// BR-F05-21, BR-F05-37: the summary and the groups, on data made on the real clock.
test("the list groups Subscriptions by next due date, with the summary's figures", async ({
	page,
}) => {
	const { netflix, gym, prime, old } = await userWithSubscriptions(page);
	await expect(page.getByText("Monthly cost", { exact: true })).toBeVisible();
	// ₹649.00 + ₹1,500.00 + ₹1,499.00 ÷ 12 = ₹2,273.92 a month; ₹27,287.00 a year.
	await expect(page.getByText("₹2,273.92").first()).toBeVisible();
	await expect(
		page.getByText("₹27,287.00 a year · 3 Subscriptions"),
	).toBeVisible();

	for (const header of ["Within 7 days", "Within 30 days", "Later"]) {
		await expect(
			list(page)
				.getByText(new RegExp(`^${header}`))
				.first(),
		).toBeVisible();
	}
	await expect(row(page, netflix)).toBeVisible();
	await expect(row(page, gym)).toBeVisible();
	await expect(row(page, prime)).toBeVisible();
	// The ended one is in its own group, closed until pressed.
	await expect(row(page, old)).toBeHidden();
	await page.getByRole("button", { name: "Ended · 1" }).click();
	await expect(row(page, old)).toBeVisible();

	// A row reads its name first, then category, amount and next date.
	await expect(row(page, netflix)).toHaveAccessibleName(
		new RegExp(
			`^Netflix, Entertainment, ₹649\\.00 a month, ${withWeekday(netflix.due).replace(".", "\\.")}`,
		),
	);
});

// BR-F05-40, BR-F05-45: the docked panel and Up and Down.
test("a selection shows its panel, Up and Down walk the rows, and Escape clears it", async ({
	page,
}) => {
	const { netflix, gym } = await userWithSubscriptions(page);
	await expect(panel(page)).toContainText("Monthly cost by category");

	await row(page, netflix).click();
	await expect(row(page, netflix)).toHaveAttribute("aria-selected", "true");
	await expect(
		panel(page).getByRole("heading", { name: "Netflix" }),
	).toBeVisible();
	await expect(panel(page)).toContainText("Charges");
	await expect(panel(page)).toContainText(
		"E to edit · S to skip · P to pause · C to cancel · Delete to delete",
	);

	await page.keyboard.press("ArrowDown");
	await expect(row(page, gym)).toHaveAttribute("aria-selected", "true");
	await expect(
		panel(page).getByRole("heading", { name: "Cult Gym" }),
	).toBeVisible();
	await page.keyboard.press("ArrowUp");
	await expect(row(page, netflix)).toHaveAttribute("aria-selected", "true");

	await page.keyboard.press("Escape");
	await expect(row(page, netflix)).toHaveAttribute("aria-selected", "false");
	await expect(panel(page)).toContainText("Monthly cost by category");
});

// BR-F05-23: View charges leads to the Subscription's charges in Transactions.
test("View charges opens Transactions filtered to the Subscription", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).click();
	await panel(page)
		.getByRole("button", { name: /View charges/ })
		.click();
	await expect(page).toHaveURL(new RegExp(`/transactions\\?sub=${netflix.id}`));
	await expect(page.getByText("Netflix").first()).toBeVisible();
});

// BR-F05-21, D-593: a link opens the page on that Subscription.
test("?open=<id> selects the Subscription's row and shows its panel", async ({
	page,
}) => {
	const { gym } = await userWithSubscriptions(page, "/subscriptions");
	await page.goto(`/subscriptions?open=${gym.id}`);
	await expect(row(page, gym)).toHaveAttribute("aria-selected", "true");
	await expect(
		panel(page).getByRole("heading", { name: "Cult Gym" }),
	).toBeVisible();
});

// BR-F05-50, D-622: a category of the panel's summary filters the list.
test("pressing a category narrows the list, shows its chip, and Show all brings the rest back", async ({
	page,
}) => {
	const { netflix, gym, prime } = await userWithSubscriptions(page);
	await panel(page)
		.getByRole("button", { name: /Entertainment/ })
		.click();
	await expect(page.getByText("Showing", { exact: true })).toBeVisible();
	await expect(row(page, netflix)).toBeVisible();
	await expect(row(page, prime)).toBeVisible();
	await expect(row(page, gym)).toBeHidden();
	await page.getByRole("button", { name: "Show all" }).first().click();
	await expect(row(page, gym)).toBeVisible();
});

// BR-F05-39, D-570: the table, its total and its sort.
test("the Table view lists them with a Total row and sorts by a heading; the choice is remembered", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await chooseView(page, "Table");
	const table = page.getByRole("grid", { name: /Select a column heading/ });
	await expect(table).toBeVisible();
	await expect(table.getByRole("row", { name: /^Total · 3/ })).toBeVisible();
	const rows = table
		.locator('[role="row"][data-key]')
		.filter({ hasNotText: /^Total/ });
	await expect(rows).toHaveCount(3);
	// Largest per month first: Cult Gym, Netflix, Prime.
	await expect(rows.nth(0)).toContainText("Cult Gym");
	await expect(rows.nth(1)).toContainText("Netflix");
	await expect(rows.nth(2)).toContainText("Prime");

	// Name sorts A to Z, then Z to A.
	await table.getByRole("columnheader", { name: /^Name/ }).click();
	await expect(rows.nth(0)).toContainText("Cult Gym");
	await table.getByRole("columnheader", { name: /^Name/ }).click();
	await expect(rows.nth(0)).toContainText("Prime");

	await page.reload();
	await expect(
		page.getByRole("grid", { name: /Select a column heading/ }),
	).toBeVisible();
	await expect(row(page, netflix)).toBeVisible();
});

// BR-F05-38: the calendar shows the month and moves by month.
test("the Calendar view shows the month, with a chip for each charge, and moves to a later month", async ({
	page,
}) => {
	await userWithSubscriptions(page);
	await chooseView(page, "Calendar");
	const months = page.getByRole("listbox", { name: "Month" });
	await expect(months).toBeVisible();
	await expect(page.getByText("Filled dot: charged")).toBeVisible();
	await expect(months.getByRole("option", { selected: true })).toBeVisible();

	await page.getByRole("button", { name: "Later months" }).click();
	const later = months.getByRole("option").last();
	await later.click();
	await expect(later).toHaveAttribute("aria-selected", "true");
	// A later month still expects the monthly charge, drawn as due.
	await expect(
		page.getByRole("button", { name: /^Netflix, ₹649\.00, due/ }).first(),
	).toBeVisible();
});

// BR-F05-21: with no Subscription the page says so and offers Add.
test("with no Subscription the page shows the empty message and an Add button, and no switch", async ({
	page,
}) => {
	await userWithNoSubscriptions(page);
	await expect(page.getByText("No Subscriptions yet.")).toBeVisible();
	await expect(
		page.getByRole("radiogroup", { name: "Show Subscriptions as" }),
	).toBeHidden();
	await expect(
		page.getByRole("button", { name: "Add a Subscription" }).first(),
	).toBeVisible();
});
