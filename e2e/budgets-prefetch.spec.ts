import { userWithGolden } from "./data";
import { clientAddress, expect, test } from "./fixtures";
import { overviewLine, row } from "./budgets";
import { requestsTo } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

const OCTOBER = "/budgets?month=2026-10";
/** Every read the Budgets page makes of its own. */
const BUDGET_READS = /^\/api\/budgets(\/(history|summary))?$/;

// STATE-5, BR-F04-14: the first HTML already holds the month.
test("the server's first HTML holds October's rows and overview", async ({
	page,
	browser,
}) => {
	await userWithGolden(page, OCTOBER);
	const context = await browser.newContext({
		storageState: await page.context().storageState(),
		javaScriptEnabled: false,
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
		timezoneId: "Asia/Kolkata",
		locale: "en-IN",
	});
	try {
		const bare = await context.newPage();
		await bare.goto(OCTOBER);
		await expect(
			bare.getByRole("heading", { level: 1, name: "Budgets" }),
		).toBeVisible();
		await expect(overviewLine(bare)).toHaveText(
			"of ₹11,000.00 · 119.7% · Over by ₹2,168.00",
		);
		await expect(row(bare, "budget:food")).toHaveAccessibleName(
			/^Food, Over by ₹1,220\.00, ₹6,220\.00 of ₹5,000\.00 · 124\.4% · Over budget/,
		);
		await expect(row(bare, "unbudgeted:housing")).toBeVisible();
		await expect(bare.getByText("Needs attention · 4")).toBeVisible();
	} finally {
		await context.close();
	}
});

// STATE-5: the browser asks for none of what the server sent.
test("loading the page asks for no month, history or summary", async ({ page }) => {
	await userWithGolden(page, "/budgets?month=2026-09");
	const reads = requestsTo(page, BUDGET_READS);

	await page.goto(OCTOBER);
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect(reads).toEqual([]);
});

// BR-F04-35: the year's figures are read when the grid opens, once.
test("the month grid reads the year once, and again only for another year", async ({
	page,
}) => {
	await userWithGolden(page, OCTOBER);
	const reads = requestsTo(page, /^\/api\/budgets\/summary$/);
	await page.getByRole("button", { name: "October 2026" }).click();
	await expect(
		page.getByRole("option", { name: /^October 2026, \d/ }),
	).toBeVisible();
	expect(reads).toEqual(["GET /api/budgets/summary?year=2026"]);

	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "October 2026" }).click();
	await expect(
		page.getByRole("option", { name: /^October 2026, \d/ }),
	).toBeVisible();
	expect(reads).toHaveLength(1);

	await page.getByRole("button", { name: /Previous year/ }).click();
	await expect(page.getByRole("option", { name: /^October 2025/ })).toBeVisible();
	await expect.poll(() => reads.length).toBe(2);
	expect(reads[1]).toBe("GET /api/budgets/summary?year=2025");
});

// STATE-5: a month is read once, and a month already read is shown from the cache.
test("another month is read once, and going back to a month already read asks for nothing", async ({
	page,
}) => {
	await userWithGolden(page, OCTOBER);
	const reads = requestsTo(page, /^\/api\/budgets$/);

	await page.getByRole("button", { name: "Previous month" }).click();
	await expect(page.getByText("Needs attention · 2")).toBeVisible();
	expect(reads).toEqual(["GET /api/budgets?month=2026-09"]);

	await page.getByRole("button", { name: "Next month" }).click();
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
	await page.goBack();
	await expect(page.getByText("Needs attention · 2")).toBeVisible();
	expect(reads).toEqual(["GET /api/budgets?month=2026-09"]);
});

// BR-F04-30: a selection reads its history and payees, once each.
test("selecting a Budget reads its history and payees, and selecting it again asks for nothing", async ({
	page,
}) => {
	await userWithGolden(page, OCTOBER);
	const reads = requestsTo(
		page,
		/^\/api\/(budgets\/history|transactions\/summary)$/,
	);
	await row(page, "budget:food").click();
	await expect(page.getByText("BigBasket")).toBeVisible();
	await expect.poll(() => reads.length).toBe(2);
	expect(
		reads.some((read) =>
			read.includes("/api/budgets/history?category=food&to=2026-10&months=6"),
		),
	).toBe(true);

	await row(page, "budget:food").click();
	await row(page, "budget:food").click();
	await expect(page.getByText("BigBasket")).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect(reads).toHaveLength(2);
});
