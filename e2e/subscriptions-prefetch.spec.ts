import { expect, test, clientAddress } from "./fixtures";
import { requestsTo } from "./transactions";
import { panel, row, userWithSubscriptions } from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

// STATE-5, BR-F05-21: the first HTML already holds the list.
test("the server's first HTML holds the rows and the summary", async ({
	page,
	browser,
}) => {
	const { netflix, gym } = await userWithSubscriptions(page);
	const context = await browser.newContext({
		storageState: await page.context().storageState(),
		javaScriptEnabled: false,
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
		timezoneId: "Asia/Kolkata",
		locale: "en-IN",
	});
	try {
		const bare = await context.newPage();
		await bare.goto("/subscriptions");
		await expect(
			bare.getByRole("heading", { level: 1, name: "Subscriptions" }),
		).toBeVisible();
		await expect(row(bare, netflix)).toBeVisible();
		await expect(row(bare, gym)).toBeVisible();
		await expect(
			bare.getByText("₹27,287.00 a year · 3 Subscriptions"),
		).toBeVisible();
	} finally {
		await context.close();
	}
});

// STATE-5: the browser asks for none of what the server sent.
test("loading the page asks for the list again by no request", async ({ page }) => {
	await userWithSubscriptions(page, "/transactions");
	const reads = requestsTo(page, /^\/api\/subscriptions$/);
	await page.goto("/subscriptions");
	await expect(page.getByText("Monthly cost", { exact: true })).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect(reads).toEqual([]);
});

// BR-F05-40, BR-F05-48: a selection reads its Subscription's charges whole, in one query.
test("selecting a Subscription reads its charges, 100 at a time, with the Subscription as the filter", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	const reads = requestsTo(page, /^\/api\/transactions$/);
	await row(page, netflix).click();
	await expect(page.getByRole("heading", { name: "Netflix" })).toBeVisible();
	await expect(panel(page)).toContainText("Paid so far");
	expect(reads.length).toBeGreaterThan(0);
	for (const read of reads) {
		expect(read).toContain(`sub=${netflix.id}`);
		expect(read).toContain("group=none");
		expect(read).toContain("limit=100");
	}
});
