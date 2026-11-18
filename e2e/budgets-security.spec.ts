import { randomUUIDv7 } from "node:crypto";

import type { Browser, Page } from "@playwright/test";

import { todayIn } from "@/lib/time";
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

type BudgetsAnswer = {
	data: {
		budgets: { id: string; version: number; overrides: unknown[] }[];
		inactive: unknown[];
		unbudgeted: unknown[];
	};
};

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

const HISTORY = "/api/budgets/history?category=food&to=2026-10&months=6";
const SUMMARY = "/api/budgets/summary?year=2026";
type HistoryAnswer = {
	data: {
		months: { month: string; limitMinor: number | null; spentMinor: number }[];
	};
};
type SummaryAnswer = {
	data: {
		months: { month: string; utilizationTenths: number | null }[];
	};
};

// SEC-2: another user's Budgets do not show.
test("another user sees none of a Budget, on the page or in the API", async ({
	page,
	browser,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	await asIntruder(browser, async (intruder) => {
		await open(intruder, "/budgets?month=2026-10");
		await expect(
			intruder.getByText("No Budgets for October 2026."),
		).toBeVisible();
		await expect(intruder.getByText("Food", { exact: true })).toHaveCount(0);
		await expect(intruder.getByText("₹6,220.00")).toHaveCount(0);

		const view = await intruder.request.get("/api/budgets?month=2026-10");
		expect(view.status()).toBe(200);
		const { data } = (await view.json()) as BudgetsAnswer;
		expect(data.budgets).toEqual([]);
		expect(data.inactive).toEqual([]);
		expect(data.unbudgeted).toEqual([]);

		// The history and the year summary are scoped the same way: 200, with no limit, no
		// spending and no utilization.
		const history = await intruder.request.get(HISTORY);
		expect(history.status()).toBe(200);
		const theirs = ((await history.json()) as HistoryAnswer).data;
		expect(theirs.months).toHaveLength(6);
		for (const each of theirs.months) {
			expect(each, `history ${each.month}`).toMatchObject({
				limitMinor: null,
				spentMinor: 0,
			});
		}
		const year = await intruder.request.get(SUMMARY);
		expect(year.status()).toBe(200);
		const theirYear = ((await year.json()) as SummaryAnswer).data;
		expect(theirYear.months).toHaveLength(12);
		for (const each of theirYear.months) {
			expect(each.utilizationTenths, `summary ${each.month}`).toBeNull();
		}
	});

	// The same reads answer the owner with figures, so the empty answers above mean something.
	const mine = await page.request.get(HISTORY);
	expect(mine.status()).toBe(200);
	const october = ((await mine.json()) as HistoryAnswer).data.months.find(
		(each) => each.month === "2026-10",
	);
	expect(october).toMatchObject({ limitMinor: 500000, spentMinor: 622000 });
	const mineYear = await page.request.get(SUMMARY);
	expect(mineYear.status()).toBe(200);
	expect(
		((await mineYear.json()) as SummaryAnswer).data.months.find(
			(each) => each.month === "2026-10",
		),
	).toMatchObject({ utilizationTenths: 1197 });
});

// SEC-2: another user's Budget and its one-month limit answer 404 and stay as they were. The
// golden Budgets have no one-month limit, so the owner makes a Budget of its own with one: a
// 404 for a month with no limit would be the same answer with or without the ownership check.
test("another user cannot change or remove a Budget or its one-month limit", async ({
	page,
	browser,
}) => {
	const { budgets } = await userWithGolden(page, "/budgets?month=2026-10");
	const food = budgets.find((budget) => budget.category === "food")!;
	const origin = originOf();
	const limitMonth = monthAfter(2);

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
	const limited = await page.request.patch(`/api/budgets/${ownerId}`, {
		data: {
			scope: "month",
			month: limitMonth,
			limitMinor: 200,
			currency: "INR",
		},
		headers: {
			origin,
			"if-match": '"1"',
			"idempotency-key": randomUUIDv7(),
		},
	});
	expect(limited.status()).toBe(200);

	/** The owner's Budget as the month view reads it. */
	const stored = async (id: string) => {
		const view = await page.request.get(`/api/budgets?month=${limitMonth}`);
		const { data } = (await view.json()) as BudgetsAnswer;
		return data.budgets.find((budget) => budget.id === id);
	};
	const before = await stored(ownerId);
	expect(before).toMatchObject({
		version: 2,
		overrides: [{ month: limitMonth, limitMinor: 200 }],
	});

	await asIntruder(browser, async (intruder) => {
		const headers = (version: number) => ({
			origin,
			"if-match": `"${version}"`,
			"idempotency-key": randomUUIDv7(),
		});
		const change = { from: "2026-11", limitMinor: 100, currency: "INR" };

		// Each at the Budget's current version, so a 409 for a stale one cannot stand in.
		const answers = {
			"change of a golden Budget": await intruder.request.patch(
				`/api/budgets/${food.id}`,
				{ data: change, headers: headers(2) },
			),
			"delete of a golden Budget": await intruder.request.delete(
				`/api/budgets/${food.id}`,
				{ data: {}, headers: headers(2) },
			),
			"change of the owner's Budget": await intruder.request.patch(
				`/api/budgets/${ownerId}`,
				{ data: change, headers: headers(2) },
			),
			"delete of the owner's Budget": await intruder.request.delete(
				`/api/budgets/${ownerId}`,
				{ data: {}, headers: headers(2) },
			),
			"remove of the owner's one-month limit": await intruder.request.delete(
				`/api/budgets/${ownerId}/overrides/${limitMonth}`,
				{ data: {}, headers: headers(2) },
			),
		};
		for (const [what, answer] of Object.entries(answers)) {
			expect(answer.status(), what).toBe(404);
		}
	});

	// Nothing changed: same version, and the one-month limit is still there.
	expect(await stored(ownerId)).toEqual(before);
	await open(page, "/budgets?month=2026-10");
	await expect(overviewLine(page)).toHaveText(
		"of ₹11,000.00 · 119.7% · Over by ₹2,168.00",
	);
	await expect(row(page, "budget:food")).toHaveAccessibleName(
		/₹6,220\.00 of ₹5,000\.00/,
	);
});

// BR-P2-20: a create under another user's id is refused without saying whose it is.
test("a create under another user's Budget id is refused as id_conflict", async ({
	page,
	browser,
}) => {
	await userWithGolden(page, "/budgets?month=2026-10");
	const origin = originOf();
	// The golden Budgets' ids are no UUIDv7, so the owner makes one of its own first.
	const body = {
		id: randomUUIDv7(),
		category: "health",
		from: monthAfter(1),
		limitMinor: 100,
		currency: "INR",
	};
	const made = await page.request.post("/api/budgets", {
		data: body,
		headers: { origin, "idempotency-key": randomUUIDv7() },
	});
	expect(made.status()).toBe(201);

	await asIntruder(browser, async (intruder) => {
		const create = await intruder.request.post("/api/budgets", {
			data: body,
			headers: { origin, "idempotency-key": randomUUIDv7() },
		});
		expect(create.status()).toBe(409);
		expect(
			((await create.json()) as { error: { code: string } }).error.code,
		).toBe("id_conflict");
	});
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
	// No element was made, which is conclusive. A broken image would also have asked for its
	// source and run its handler, so wait for the page to go quiet before counting dialogs.
	await expect(page.locator("img[src='x']")).toHaveCount(0);
	await page.waitForLoadState("networkidle");
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
	// One instant gives both fields, so they name the same day in the first minute after
	// midnight too, and it is in whole minutes, as the API wants (BR-F03-06).
	const happened = new Date(Math.floor((Date.now() - 60_000) / 60_000) * 60_000);
	const made = await page.request.post("/api/transactions", {
		data: {
			id: randomUUIDv7(),
			type: "expense",
			amountMinor: 9_999_900,
			currency: "INR",
			category: "food",
			payee: markup,
			description: null,
			occurredAt: happened.toISOString(),
			occurredOn: todayIn("Asia/Kolkata", happened),
			createdAt: new Date().toISOString(),
		},
		headers: { origin, "idempotency-key": randomUUIDv7() },
	});
	expect(made.status()).toBe(201);

	await page.goto("/budgets");
	await row(page, "budget:food").click();
	await expect(panel(page)).toContainText(markup);
	// No element was made, which is conclusive. A broken image would also have asked for its
	// source and run its handler, so wait for the page to go quiet before counting dialogs.
	await expect(page.locator("img[src='x']")).toHaveCount(0);
	await page.waitForLoadState("networkidle");
	expect(dialogs).toBe(0);
});
