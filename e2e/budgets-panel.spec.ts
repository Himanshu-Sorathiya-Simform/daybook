import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import { dialog, drawer, group, panel, row } from "./budgets";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

test.describe("docked, from 1180 px (BR-F04-30, D-571)", () => {
	// BR-F04-17: a press selects, a second press clears, Escape clears.
	test("a click selects the row, a second click clears it, and Escape clears it", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await row(page, "budget:food").click();
		await expect(row(page, "budget:food")).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(panel(page)).toContainText("Budget");
		await expect(panel(page)).toContainText("₹5,000.00 from Oct 2026");

		await row(page, "budget:food").click();
		await expect(row(page, "budget:food")).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(panel(page)).toContainText("Compared with September");

		await row(page, "budget:shopping").click();
		await page.keyboard.press("Escape");
		await expect(row(page, "budget:shopping")).toHaveAttribute(
			"aria-selected",
			"false",
		);
		await expect(panel(page)).toContainText("This month");
	});

	// BR-F04-30: Close details clears the selection too.
	test("Close details clears the selection", async ({ page }) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await row(page, "budget:food").click();
		await panel(page).getByRole("button", { name: "Close details" }).click();
		await expect(row(page, "budget:food")).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});

	// BR-F04-30 item 2: a Budget's figures, state and source.
	test("a Budget shows its spent, limit, utilization, state and source; September adds what comes next", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await row(page, "budget:food").click();
		await expect(panel(page)).toContainText("₹6,220.00");
		await expect(panel(page)).toContainText("of ₹5,000.00");
		await expect(panel(page)).toContainText(
			"124.4% · Over by ₹1,220.00 · Over budget",
		);
		await expect(panel(page)).toContainText("₹5,000.00 from Oct 2026");

		await page.goto("/budgets?month=2026-09");
		await row(page, "budget:food").click();
		await expect(panel(page)).toContainText(
			"₹6,000.00 from Sept 2026, then ₹5,000.00 from Oct 2026",
		);
		await expect(panel(page)).toContainText("84.2%");
	});

	// BR-F04-30 item 7: a Not budgeted category's panel and its Add a Budget.
	test("a Not budgeted row says what was spent with no limit, and Add a Budget opens with it chosen", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await row(page, "unbudgeted:housing").click();
		await expect(panel(page)).toContainText("Not budgeted");
		await expect(panel(page)).toContainText(
			"₹18,000.00 spent in October, no limit",
		);
		await expect(panel(page)).toContainText("Up and down arrows move");
		await panel(page).getByRole("button", { name: "Add a Budget" }).click();
		const add = dialog(page, "Add a Budget");
		await expect(add.getByRole("radio", { name: /^Housing/ })).toBeChecked();
	});

	// D-579: a category in both groups is one selection, shown as Not budgeted.
	test("transportation in September is Not budgeted in the panel, with Delete on its Not active row", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-09");
		await row(page, "unbudgeted:transportation").click();
		await expect(panel(page)).toContainText("Not budgeted");
		await expect(
			panel(page).getByRole("button", { name: "Change limit" }),
		).toBeVisible();
		await expect(
			panel(page).getByRole("button", { name: "Delete" }),
		).toHaveCount(0);

		await group(page, /^Not active this month · 1/).click();
		await expect(row(page, "inactive:transportation")).toContainText(
			"Starts October 2026",
		);
		await row(page, "inactive:transportation")
			.getByRole("button", { name: "Delete" })
			.click();
		await expect(
			page.getByRole("alertdialog", {
				name: "Delete the Transportation Budget?",
			}),
		).toBeVisible();
	});

	// BR-F04-30 item 3: Last 6 months, as a chart with a text, or as a table.
	test("Last 6 months is a chart with a text, and View as table shows the same figures", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await row(page, "budget:food").click();
		const section = panel(page).getByRole("region", { name: "Last 6 months" });
		await expect(
			section.getByRole("img", { name: /^Spent by month: / }),
		).toBeVisible();
		await expect(section.getByRole("img")).toHaveAccessibleName(
			/Sept 2026 ₹5,050\.00 of ₹6,000\.00; Oct 2026 ₹6,220\.00 of ₹5,000\.00/,
		);

		await section.getByRole("button", { name: "View as table" }).click();
		const table = section.getByRole("table");
		await expect(table).toBeVisible();
		await expect(
			table.getByRole("columnheader").allInnerTexts(),
		).resolves.toEqual(["Month", "Limit", "Spent", "Used"]);
		await expect(table.getByRole("row", { name: /^Sept 2026/ })).toContainText(
			"84.2%",
		);
		await expect(table.getByRole("row", { name: /^Oct 2026/ })).toContainText(
			"124.4%",
		);
		await expect(table.getByRole("row", { name: /^Oct 2026/ })).toHaveClass(
			/font-bold/,
		);

		await section.getByRole("button", { name: "View as chart" }).click();
		await expect(
			section.getByRole("img", { name: /^Spent by month: / }),
		).toBeVisible();
	});

	// BR-F04-30 item 5: the limit history.
	test("Limit history lists the entries newest first, with the one in force marked", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await row(page, "budget:food").click();
		const history = panel(page).getByRole("region", { name: "Limit history" });
		const items = history.getByRole("listitem");
		await expect(items).toHaveCount(3);
		await expect(items.nth(0)).toContainText("₹5,000.00 from Oct 2026");
		await expect(items.nth(0)).toContainText("In force in October");
		await expect(items.nth(1)).toContainText("₹6,000.00 from Sept 2026");
		await expect(items.nth(2)).toContainText("No Budget before Sept 2026");

		await page.goto("/budgets?month=2026-09");
		await row(page, "budget:food").click();
		await expect(
			panel(page)
				.getByRole("region", { name: "Limit history" })
				.getByRole("listitem")
				.nth(1),
		).toContainText("In force in September");
	});
});

test.describe("as a drawer, below 1180 px (BR-F04-30, D-571)", () => {
	// BR-F04-30: the panel docks from 1180 px, and below it is a drawer a selection opens.
	test("at 1179 px no panel shows until a row is chosen, which opens the drawer; at 1180 px it docks", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await page.setViewportSize({ width: 1179, height: 900 });
		await expect(panel(page)).toBeHidden();
		await expect(drawer(page)).toBeHidden();
		await row(page, "budget:food").click();
		await expect(drawer(page)).toBeVisible();
		await expect(drawer(page)).toContainText("₹6,220.00");
		await drawer(page).getByRole("button", { name: "Close details" }).click();
		await expect(drawer(page)).toBeHidden();

		await page.setViewportSize({ width: 1180, height: 900 });
		await expect(panel(page)).toBeVisible();
		await expect(panel(page)).toContainText("Compared with September");
	});

	test("Escape closes the drawer and clears the selection; the hint leaves out the arrows", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await page.setViewportSize({ width: 1000, height: 900 });
		await row(page, "budget:food").click();
		await expect(drawer(page)).toContainText(
			"L to change limit · S to stop · Delete to delete",
		);
		await expect(drawer(page)).not.toContainText("Up and down arrows");
		await page.keyboard.press("Escape");
		await expect(drawer(page)).toBeHidden();
		await expect(row(page, "budget:food")).toHaveAttribute(
			"aria-selected",
			"false",
		);
	});

	test("a press on the scrim closes the drawer", async ({ page }) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await page.setViewportSize({ width: 1000, height: 900 });
		await row(page, "budget:food").click();
		await expect(drawer(page)).toBeVisible();
		await page.mouse.click(40, 450);
		await expect(drawer(page)).toBeHidden();
	});

	test("the keys L, S and Delete work with the drawer open, and while it is open Up and Down do nothing", async ({
		page,
	}) => {
		await userWithGolden(page, "/budgets?month=2026-10");
		await page.setViewportSize({ width: 1000, height: 900 });
		await row(page, "budget:food").click();
		await page.keyboard.press("ArrowDown");
		await expect(drawer(page)).toContainText("Food");
		await page.keyboard.press("l");
		await expect(dialog(page, "Change the Food limit")).toBeVisible();
	});
});
