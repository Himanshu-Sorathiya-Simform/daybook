import { randomUUIDv7 } from "node:crypto";

import type { Browser, Page } from "@playwright/test";

import { insertProfile } from "../seed/load-golden";
import { open, signUpByApi } from "./data";
import { withDatabase } from "./db";
import { clientAddress, expect, test } from "./fixtures";
import { userWithSubscriptions } from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

/** The nonce in a response's CSP. */
function nonceOf(csp: string | undefined): string {
	const match = /'nonce-([^']+)'/.exec(csp ?? "");
	if (!match) throw new Error(`No nonce in the CSP: ${csp}`);
	return match[1]!;
}

// AC-P2-15 on the Subscriptions page, logged in and with data.
test("/subscriptions carries a CSP nonce on every script, and runs with no violation", async ({
	page,
}) => {
	await userWithSubscriptions(page);
	const response = await page.request.get("/subscriptions");
	const nonce = nonceOf(response.headers()["content-security-policy"]);
	const scripts = (await response.text()).match(/<script\b[^>]*>/gi) ?? [];
	expect(scripts.length).toBeGreaterThan(0);
	for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
	await expect(page.getByText("Monthly cost", { exact: true })).toBeVisible();
});

/** Runs `run` with a second, signed-up user who has a profile and no data. */
async function asIntruder(browser: Browser, run: (intruder: Page) => Promise<void>) {
	const context = await browser.newContext({
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
		viewport: { width: 1440, height: 1000 },
		timezoneId: "Asia/Kolkata",
		locale: "en-IN",
	});
	try {
		const intruder = await context.newPage();
		const { userId } = await signUpByApi(intruder);
		await withDatabase("DATABASE_URL_SYSTEM", (client) =>
			insertProfile(client, userId),
		);
		await run(intruder);
	} finally {
		await context.close();
	}
}

const originOf = () => test.info().project.use.baseURL!;

// SEC-2: another user's Subscriptions do not show.
test("another user sees none of a Subscription, on the page or in the API", async ({
	page,
	browser,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await asIntruder(browser, async (intruder) => {
		await open(intruder, "/subscriptions");
		await expect(intruder.getByText("No Subscriptions yet.")).toBeVisible();
		await expect(intruder.getByText("Netflix")).toHaveCount(0);

		const view = await intruder.request.get("/api/subscriptions");
		expect(view.status()).toBe(200);
		const { data } = (await view.json()) as { data: { items: unknown[] } };
		expect(data.items).toEqual([]);

		// A deep link to someone else's id selects nothing.
		await intruder.goto(`/subscriptions?open=${netflix.id}`);
		await expect(intruder.getByText("No Subscriptions yet.")).toBeVisible();
		await expect(intruder.getByRole("heading", { name: "Netflix" })).toHaveCount(
			0,
		);
	});
});

// SEC-2: another user cannot change, skip or delete one.
test("another user cannot change, skip or delete a Subscription: each answers 404 and nothing changes", async ({
	page,
	browser,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await asIntruder(browser, async (intruder) => {
		const headers = (version: number) => ({
			origin: originOf(),
			"if-match": `"${version}"`,
			"idempotency-key": randomUUIDv7(),
		});
		const changedAt = new Date().toISOString();
		const answers = {
			change: await intruder.request.patch(
				`/api/subscriptions/${netflix.id}`,
				{
					data: { changedAt, name: "Taken" },
					headers: headers(1),
				},
			),
			skip: await intruder.request.post(
				`/api/subscriptions/${netflix.id}/skips`,
				{
					data: { changedAt, dueOn: netflix.due },
					headers: headers(1),
				},
			),
			delete: await intruder.request.delete(
				`/api/subscriptions/${netflix.id}`,
				{
					data: { changedAt },
					headers: headers(1),
				},
			),
		};
		for (const [what, answer] of Object.entries(answers)) {
			expect(answer.status(), what).toBe(404);
		}
	});
	await page.reload();
	await expect(page.getByRole("row", { name: /^Netflix,/ })).toBeVisible();
});
