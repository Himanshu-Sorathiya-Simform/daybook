import { userWithGolden } from "./data";
import { clientAddress, expect, test } from "./fixtures";
import { expectHeader, requestsTo, rows } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

const CHECK_B = "/transactions?from=2026-10-01&to=2026-10-31&cat=food";

// AC-F03-63, BR-F03-76: the first HTML already holds the list and the header.
test("the server's first HTML holds check B's 4 rows and Out ₹6,220.00", async ({
	page,
	browser,
}) => {
	await userWithGolden(page);
	const context = await browser.newContext({
		storageState: await page.context().storageState(),
		javaScriptEnabled: false,
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
	});
	try {
		const bare = await context.newPage();
		await bare.goto(CHECK_B);
		const list = bare.getByRole("grid", { name: "Transactions" });
		await expect(list.locator('[role="row"][data-key]')).toHaveCount(4);
		await expect(list).toContainText("−₹640.00");
		await expect(
			bare
				.locator("dt", { hasText: /^Out$/ })
				.locator("xpath=following-sibling::dd[1]"),
		).toHaveText("₹6,220.00");
	} finally {
		await context.close();
	}
});

// AC-F03-63: the browser asks for none of what the server sent.
test("loading the page asks for no list, summary or views", async ({ page }) => {
	await userWithGolden(page, "/transactions?q=nothing-here");
	const reads = requestsTo(
		page,
		/^\/api\/(transactions|transactions\/summary|transaction-views)$/,
	);

	await page.goto(CHECK_B);
	await expect(rows(page)).toHaveCount(4);
	await expectHeader(page, { count: 4, inText: "₹0.00", out: "₹6,220.00" });
	await page.waitForLoadState("networkidle");
	expect(reads).toEqual([]);
});
