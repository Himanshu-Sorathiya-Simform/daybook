import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import {
	conflictView,
	currentMonth,
	dialog,
	drawer,
	expectNotice,
	limitBox,
	longMonth,
	monthName,
	pickEarliestMonth,
	row,
	scrollsSideways,
} from "./budgets";
import { open } from "./data";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 375, height: 740 },
	hasTouch: true,
});

// D-512, D-570, BR-F04-14: the phone layout.
test("the phone layout: the list only, an icon Add, the month control on its own row with 44 px targets", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
	await expect(
		page.getByRole("radiogroup", { name: "Show Budgets as" }),
	).toBeHidden();
	await expect(
		page.getByRole("grid", { name: /Select a column heading/ }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Add a Budget" }).first(),
	).toBeVisible();
	for (const name of ["Previous month", "Next month"]) {
		const box = await page.getByRole("button", { name }).boundingBox();
		expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
	}
	expect(await scrollsSideways(page)).toBe(false);
});

// BR-F04-30, D-571: a tapped row opens the drawer, whose hint leaves out the arrows.
test("a tapped row opens the drawer, which closes with Close details", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").tap();
	await expect(drawer(page)).toBeVisible();
	await expect(drawer(page)).toContainText("₹6,220.00");
	await expect(drawer(page)).toContainText("L to change limit");
	await expect(drawer(page)).not.toContainText("Up and down arrows");
	expect(await scrollsSideways(page)).toBe(false);
	await drawer(page).getByRole("button", { name: "Close details" }).click();
	await expect(drawer(page)).toBeHidden();
});

// D-400, D-512: dialogs are sheets with 44 px targets.
test("Change limit opens as a sheet from the bottom with 44 px targets, and its long preview fits", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").tap();
	await drawer(page).getByRole("button", { name: "Change limit" }).click();
	const change = dialog(page, "Change the Food limit");
	await expect(change).toBeVisible();
	const sheet = await change.boundingBox();
	expect((sheet?.y ?? 0) + (sheet?.height ?? 0)).toBeGreaterThan(700);
	const save = change.getByRole("button", { name: /^Change from/ });
	expect((await save.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

	await limitBox(change).fill("7000");
	await pickEarliestMonth(page);
	await expect(
		change.getByRole("table", { name: "Months that change" }),
	).toBeVisible();
	expect(await scrollsSideways(page)).toBe(false);
	const table = await change
		.getByRole("table", { name: "Months that change" })
		.boundingBox();
	expect((table?.x ?? 0) + (table?.width ?? 0)).toBeLessThanOrEqual(375);
});

// BR-F04-29: below 1180 px the notice goes where the Budget is shown.
test("with nothing selected a write opens no drawer and its notice is above the list; with the drawer open the drawer shows it", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-09");
	await row(page, "unbudgeted:health")
		.getByRole("button", { name: "Add a Budget" })
		.tap();
	const add = dialog(page, "Add a Budget");
	await limitBox(add).fill("1500");
	await add
		.getByRole("button", {
			name: `Add Budget from ${monthName(currentMonth())}`,
		})
		.tap();
	await expectNotice(
		page,
		`Health Budget added: ₹1,500.00 from ${longMonth(currentMonth())}.`,
	);
	await expect(drawer(page)).toBeHidden();

	await page.goto("/budgets?month=2026-10");
	await row(page, "budget:food").tap();
	await drawer(page).getByRole("button", { name: "Change limit" }).click();
	const change = dialog(page, "Change the Food limit");
	await limitBox(change).fill("7000");
	await change.getByRole("button", { name: /^Change from/ }).tap();
	await expect(drawer(page).getByRole("status")).toContainText(
		`Food limit is now ₹7,000.00 from ${longMonth(currentMonth())}.`,
	);
});

// BR-F04-23: the conflict view as a sheet.
test("the conflict view is a sheet that fits, with its choices in reach", async ({
	page,
	context,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await row(page, "budget:food").tap();
	await drawer(page).getByRole("button", { name: "Change limit" }).click();
	const mine = dialog(page, "Change the Food limit");

	const other = await context.newPage();
	await open(other, "/budgets?month=2026-10");
	await row(other, "budget:food").tap();
	await other
		.getByRole("dialog", { name: "Budget details" })
		.getByRole("button", { name: "Change limit" })
		.click();
	const theirs = dialog(other, "Change the Food limit");
	await limitBox(theirs).fill("5500");
	await theirs.getByRole("button", { name: /^Change from/ }).tap();
	await expect(theirs).toBeHidden();

	await limitBox(mine).fill("7000");
	await mine.getByRole("button", { name: /^Change from/ }).tap();
	await expect(conflictView(page)).toBeVisible();
	expect(await scrollsSideways(page)).toBe(false);
	for (const name of ["Keep mine", "Keep theirs"]) {
		const box = await conflictView(page)
			.getByRole("button", { name })
			.boundingBox();
		expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
		expect((box?.x ?? 0) + (box?.width ?? 0), name).toBeLessThanOrEqual(375);
	}
});
