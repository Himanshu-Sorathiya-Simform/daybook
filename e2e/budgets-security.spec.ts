import { randomUUIDv7 } from "node:crypto";

import { insertProfile } from "../seed/load-golden";
import { open, signUpByApi, userWithGolden } from "./data";
import { withDatabase } from "./db";
import { clientAddress, expect, test } from "./fixtures";
import { monthAfter, overviewLine, panel, row } from "./budgets";

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

// AC-P2-15 on the Budgets page, logged in and with data.
test("/budgets carries a CSP nonce on every script, and runs with no violation", async ({
	page,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const response = await page.request.get("/budgets?month=2026-10");
	const nonce = nonceOf(response.headers()["content-security-policy"]);
	const scripts = (await response.text()).match(/<script\b[^>]*>/gi) ?? [];
	expect(scripts.length).toBeGreaterThan(0);
	for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
	// The page itself ran under the fixture, which fails on any console violation.
	await expect(page.getByText("Needs attention · 4")).toBeVisible();
});

// SEC-2, AC-F04-08: another user's Budget ids reveal nothing and change nothing.
test("another user sees none of a Budget, and its ids answer 404 or 409", async ({
	page,
	browser,
}) => {
	const { budgets } = await userWithGolden(page, "/budgets?month=2026-10");
	const food = budgets.find((budget) => budget.category === "food")!;

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

		await open(intruder, "/budgets?month=2026-10");
		await expect(
			intruder.getByText("No Budgets for October 2026."),
		).toBeVisible();
		await expect(intruder.getByText("Food", { exact: true })).toHaveCount(0);
		await expect(intruder.getByText("₹6,220.00")).toHaveCount(0);

		const origin = test.info().project.use.baseURL!;
		const headers = () => ({
			origin,
			"if-match": '"2"',
			"idempotency-key": randomUUIDv7(),
		});
		const view = await intruder.request.get("/api/budgets?month=2026-10");
		expect(view.status()).toBe(200);
		const { data } = (await view.json()) as {
			data: { budgets: unknown[]; inactive: unknown[]; unbudgeted: unknown[] };
		};
		expect(data.budgets).toEqual([]);
		expect(data.inactive).toEqual([]);
		expect(data.unbudgeted).toEqual([]);

		const path = `/api/budgets/${food.id}`;
		const patch = await intruder.request.patch(path, {
			data: { from: "2026-11", limitMinor: 100, currency: "INR" },
			headers: headers(),
		});
		expect(patch.status(), "PATCH of another user's Budget").toBe(404);
		const remove = await intruder.request.delete(path, {
			data: {},
			headers: headers(),
		});
		expect(remove.status(), "DELETE of another user's Budget").toBe(404);
		const override = await intruder.request.delete(`${path}/overrides/2026-10`, {
			data: {},
			headers: headers(),
		});
		expect(override.status(), "Remove of another user's one-month limit").toBe(
			404,
		);

		// A create under an id that is another user's reveals only that it cannot be made. The
		// golden Budgets' ids are no UUIDv7, so the owner makes one of its own first.
		const ownerId = randomUUIDv7();
		const made = await page.request.post("/api/budgets", {
			data: {
				id: ownerId,
				category: "health",
				from: monthAfter(1),
				limitMinor: 100,
				currency: "INR",
			},
			headers: { origin, "idempotency-key": randomUUIDv7() },
		});
		expect(made.status()).toBe(201);
		const create = await intruder.request.post("/api/budgets", {
			data: {
				id: ownerId,
				category: "health",
				from: monthAfter(1),
				limitMinor: 100,
				currency: "INR",
			},
			headers: { origin, "idempotency-key": randomUUIDv7() },
		});
		expect(create.status()).toBe(409);
		expect(
			((await create.json()) as { error: { code: string } }).error.code,
		).toBe("id_conflict");
	} finally {
		await context.close();
	}

	// The owner's Budget is untouched.
	await open(page, "/budgets?month=2026-10");
	await expect(overviewLine(page)).toHaveText(
		"of ₹11,000.00 · 119.7% · Over by ₹2,168.00",
	);
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹5,000\.00/,
	);
});

// SEC-1: every Budgets endpoint wants a session.
test("with no session every Budgets endpoint answers 401", async ({ browser }) => {
	const context = await browser.newContext({
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
	});
	try {
		const origin = test.info().project.use.baseURL!;
		const headers = {
			origin,
			"idempotency-key": randomUUIDv7(),
			"if-match": '"1"',
		};
		const id = randomUUIDv7();
		const answers = await Promise.all([
			context.request.get("/api/budgets?month=2026-10"),
			context.request.get(
				"/api/budgets/history?category=food&to=2026-10&months=6",
			),
			context.request.get("/api/budgets/summary?year=2026"),
			context.request.post("/api/budgets", {
				data: {
					id,
					category: "food",
					from: "2026-10",
					limitMinor: 100,
					currency: "INR",
				},
				headers,
			}),
			context.request.patch(`/api/budgets/${id}`, {
				data: { from: "2026-11", limitMinor: 100, currency: "INR" },
				headers,
			}),
			context.request.delete(`/api/budgets/${id}`, { data: {}, headers }),
			context.request.delete(`/api/budgets/${id}/overrides/2026-10`, {
				data: {},
				headers,
			}),
		]);
		expect(answers.map((answer) => answer.status())).toEqual(Array(7).fill(401));
	} finally {
		await context.close();
	}
});

// API-4, API-5, SRV: a Budget write wants its checks.
test("a Budget write without If-Match, from another origin or with a stale version is refused", async ({
	page,
}) => {
	const { budgets } = await userWithGolden(page, "/budgets?month=2026-10");
	const food = budgets.find((budget) => budget.category === "food")!;
	const origin = test.info().project.use.baseURL!;
	const path = `/api/budgets/${food.id}`;
	const body = { from: "2026-11", limitMinor: 100, currency: "INR" };

	const noMatch = await page.request.patch(path, {
		data: body,
		headers: { origin, "idempotency-key": randomUUIDv7() },
	});
	expect(noMatch.status(), "no If-Match").toBe(400);

	const wrongOrigin = await page.request.patch(path, {
		data: body,
		headers: {
			origin: "https://evil.example",
			"if-match": '"2"',
			"idempotency-key": randomUUIDv7(),
		},
	});
	expect(wrongOrigin.status(), "another origin").toBe(403);

	const stale = await page.request.patch(path, {
		data: body,
		headers: { origin, "if-match": '"1"', "idempotency-key": randomUUIDv7() },
	});
	expect(stale.status(), "a stale version").toBe(409);
	expect(((await stale.json()) as { error: { code: string } }).error.code).toBe(
		"version_conflict",
	);

	const noKey = await page.request.patch(path, {
		data: body,
		headers: { origin, "if-match": '"2"' },
	});
	expect(noKey.status(), "no Idempotency-Key").toBe(400);

	// Nothing changed.
	await open(page, "/budgets?month=2026-10");
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹5,000\.00 from Oct 2026$/,
	);
});

// FIL-5: text from the URL is text, never markup.
test("markup in a month link shows nothing and runs nothing", async ({ page }) => {
	let dialogs = 0;
	page.on("dialog", (dialog) => {
		dialogs += 1;
		void dialog.dismiss();
	});
	await userWithGolden(page, "/budgets");
	await page.goto(
		`/budgets?month=${encodeURIComponent('<img src=x onerror="alert(1)">')}`,
	);
	await expect(
		page.getByText("Some filters in this link weren't valid and were removed."),
	).toBeVisible();
	await expect(page.locator("img[src='x']")).toHaveCount(0);
	expect(dialogs).toBe(0);
});

// XSS: a payee name is text in Where it went.
test("a payee name with markup shows as text in Where it went", async ({ page }) => {
	await userWithGolden(page, "/budgets");
	let dialogs = 0;
	page.on("dialog", (dialog) => {
		dialogs += 1;
		void dialog.dismiss();
	});
	const markup = '<img src=x onerror="alert(1)">';
	const origin = test.info().project.use.baseURL!;
	const at = new Date();
	at.setSeconds(0, 0);
	const today = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Kolkata",
	}).format(at);
	const made = await page.request.post("/api/transactions", {
		data: {
			id: randomUUIDv7(),
			type: "expense",
			amountMinor: 9_999_900,
			currency: "INR",
			category: "food",
			payee: markup,
			description: null,
			occurredAt: new Date(at.getTime() - 60_000).toISOString(),
			occurredOn: today,
			createdAt: new Date().toISOString(),
		},
		headers: { origin, "idempotency-key": randomUUIDv7() },
	});
	expect(made.status()).toBe(201);

	await page.goto("/budgets");
	await row(page, "budget:food").click();
	await expect(panel(page)).toContainText(markup);
	await expect(page.locator("img[src='x']")).toHaveCount(0);
	expect(dialogs).toBe(0);
});
