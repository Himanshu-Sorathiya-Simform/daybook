import { randomUUIDv7 } from "node:crypto";

import { open, signUpByApi, userWithGolden } from "./data";
import { clientAddress, expect, test } from "./fixtures";
import { insertProfile } from "../seed/load-golden";
import { withDatabase } from "./db";
import { panel, rows, searchBox } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

/** The nonce in a response's CSP. */
function nonceOf(csp: string | undefined): string {
	const match = /'nonce-([^']+)'/.exec(csp ?? "");
	if (!match) throw new Error(`No nonce in the CSP: ${csp}`);
	return match[1]!;
}

// AC-P2-15 on the Transactions page, logged in and with data.
test("/transactions carries a CSP nonce on every script, and runs with no violation", async ({
	page,
}) => {
	await userWithGolden(page);
	const response = await page.request.get("/transactions");
	const nonce = nonceOf(response.headers()["content-security-policy"]);
	const scripts = (await response.text()).match(/<script\b[^>]*>/gi) ?? [];
	expect(scripts.length).toBeGreaterThan(0);
	for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
	// The page itself ran under the fixture, which fails on any console violation.
	await expect(rows(page)).toHaveCount(22);
});

// SEC-2, AC-F03-53, AC-F03-58: another user's ids reveal nothing.
test("another user's row and view links show nothing of theirs, and their ids answer 404", async ({
	page,
	browser,
}) => {
	const { golden } = await userWithGolden(page, "/transactions?cat=food");
	await page.getByRole("button", { name: "Save as view", exact: true }).click();
	await expect(page).toHaveURL(/view=[0-9a-f-]{36}$/);
	const viewId = new URL(page.url()).searchParams.get("view")!;

	const context = await browser.newContext({
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
		viewport: { width: 1280, height: 800 },
	});
	try {
		const intruder = await context.newPage();
		const { userId } = await signUpByApi(intruder);
		await withDatabase("DATABASE_URL_SYSTEM", (client) =>
			insertProfile(client, userId),
		);

		await open(intruder, `/transactions?txn=${golden.id(24)}&view=${viewId}`);
		await expect(
			intruder.getByText("We couldn't find that Transaction."),
		).toBeVisible();
		await expect(intruder).toHaveURL(/\/transactions$/);
		await expect(intruder.getByText("Swiggy")).toHaveCount(0);
		await expect(intruder.getByText("−₹640.00")).toHaveCount(0);
		await expect(panel(intruder)).not.toContainText("Swiggy");

		const origin = test.info().project.use.baseURL!;
		const path = `/api/transactions/${golden.id(24)}`;
		expect((await intruder.request.get(path)).status()).toBe(404);
		for (const method of ["patch", "delete"] as const) {
			const answer = await intruder.request[method](path, {
				data: method === "patch" ? { note: "mine now" } : {},
				headers: {
					origin,
					"if-match": '"1"',
					"idempotency-key": randomUUIDv7(),
				},
			});
			expect(answer.status(), `${method} of another user's row`).toBe(404);
		}
	} finally {
		await context.close();
	}

	// The owner's row is untouched.
	await open(page, `/transactions?txn=${golden.id(24)}`);
	await expect(panel(page)).toContainText("−₹640.00");
	await expect(panel(page)).not.toContainText("mine now");
});

// FIL-5: text from the URL is text, never markup.
test("markup in a search link shows as text and runs nothing", async ({ page }) => {
	let dialogs = 0;
	page.on("dialog", (dialog) => {
		dialogs += 1;
		void dialog.dismiss();
	});
	const markup = '<img src=x onerror="alert(1)">';
	await userWithGolden(page, `/transactions?q=${encodeURIComponent(markup)}`);

	await expect(searchBox(page)).toHaveValue(markup);
	await expect(
		page.getByRole("button", { name: `Remove “${markup}”` }),
	).toBeVisible();
	await expect(page.locator("img[src='x']")).toHaveCount(0);
	expect(dialogs).toBe(0);
});
