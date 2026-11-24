import { randomUUIDv7 } from "node:crypto";

import {
	type BrowserContext,
	expect,
	type Locator,
	type Page,
	test,
} from "@playwright/test";

import { formatDayHeader, formatShortDate } from "@/lib/date-format";
import { shiftDays, shiftMonths, todayIn } from "@/lib/time";
import { insertProfile } from "../seed/load-golden";
import { open, signUpByApi } from "./data";
import { type Account } from "./accounts";
import { withDatabase } from "./db";

/** Shared data and locators for the Subscriptions page's end-to-end tests (F05 section 6). */

/** The profile's formats, golden's (the tests' accounts are created with them). */
export const FORMATS = { dateLocale: "en-IN" };
export const TIMEZONE = "Asia/Kolkata";

/** The profile's today on the real clock. */
export const today = () => todayIn(TIMEZONE, new Date());

/** A date as a row, notice or message writes it: "5 Nov", with the year outside this one. */
export const short = (date: string) =>
	formatShortDate(date, { ...FORMATS, today: today() });

/** A date with its weekday, as "Thu, 5 Nov". */
export const withWeekday = (date: string) =>
	formatDayHeader(date, { ...FORMATS, today: today() });

/** A due date `days` ahead, moved on to a day of the month that every month has, so that a
 * monthly schedule started two months earlier lands on it exactly. */
function dueAhead(days: number): string {
	let due = shiftDays(today(), days);
	while (Number(due.slice(8)) > 28) due = shiftDays(due, 1);
	return due;
}

/** One Subscription the tests create, with the date it is next due. */
export type Made = { id: string; name: string; due: string; amountMinor: number };

type Plan = {
	name: string;
	amountMinor: number;
	category: string;
	cadence: { unit: "week" | "month"; every: number };
	/** The first due date; the schedule starts there. */
	startDate: string;
	/** Charges back to the start date are created with it. */
	backfill?: boolean;
	/** The due date after the ones already charged, which the row shows. */
	due: string;
};

/** Creates `plan` through the API, as the Add dialog does (F05 section 11). */
async function create(page: Page, plan: Plan): Promise<Made> {
	const origin = test.info().project.use.baseURL!;
	const id = randomUUIDv7();
	const made = await page.request.post("/api/subscriptions", {
		data: {
			id,
			name: plan.name,
			amountMinor: plan.amountMinor,
			currency: "INR",
			cadence: plan.cadence,
			startDate: plan.startDate,
			category: plan.category,
			note: "",
			backfill: plan.backfill ?? false,
			createdAt: new Date().toISOString(),
		},
		headers: { origin, "idempotency-key": randomUUIDv7() },
	});
	expect(made.status(), await made.text()).toBe(201);
	return { id, name: plan.name, due: plan.due, amountMinor: plan.amountMinor };
}

/** Ends a Subscription yesterday through the API, as Cancel's "I cancelled it earlier" does. */
async function endYesterday(page: Page, made: Made): Promise<void> {
	const origin = test.info().project.use.baseURL!;
	const ended = await page.request.patch(`/api/subscriptions/${made.id}`, {
		data: {
			changedAt: new Date().toISOString(),
			endDate: shiftDays(today(), -1),
		},
		headers: {
			origin,
			"if-match": '"1"',
			"idempotency-key": randomUUIDv7(),
		},
	});
	expect(ended.status(), await ended.text()).toBe(200);
}

/** What `userWithSubscriptions` made. */
export type Data = {
	account: Account;
	/** Monthly, ₹649.00, due in 3 or so days, with two past charges: Within 7 days. */
	netflix: Made;
	/** Monthly, ₹1,500.00, due in about 12 days, with a past charge: Within 30 days. */
	gym: Made;
	/** Yearly, ₹1,499.00, due in about two months: Later. */
	prime: Made;
	/** Monthly, ₹300.00, ended yesterday: in Ended. */
	old: Made;
};

/**
 * A new user with golden's profile and four Subscriptions made through the API on the real
 * clock, one for each of the list's main groups, on `/subscriptions` at `path`. Their dates
 * follow the day the test runs, so tests compute the words they expect from `Data`. The profile
 * is caught up to today, so the boot catch-up adds nothing.
 */
export async function userWithSubscriptions(
	page: Page,
	path = "/subscriptions",
): Promise<Data> {
	const { account, userId } = await signUpByApi(page);
	await withDatabase("DATABASE_URL_SYSTEM", (client) =>
		insertProfile(client, userId, { today: today() }),
	);
	const netflixDue = dueAhead(3);
	const netflix = await create(page, {
		name: "Netflix",
		amountMinor: 64900,
		category: "entertainment",
		cadence: { unit: "month", every: 1 },
		startDate: shiftMonths(netflixDue, -2),
		backfill: true,
		due: netflixDue,
	});
	const gymDue = dueAhead(12);
	const gym = await create(page, {
		name: "Cult Gym",
		amountMinor: 150000,
		category: "health",
		cadence: { unit: "month", every: 1 },
		startDate: shiftMonths(gymDue, -1),
		backfill: true,
		due: gymDue,
	});
	// Yearly: the first charge was 10 months ago, so the next is in two.
	const primeDue = shiftMonths(dueAhead(1), 2);
	const prime = await create(page, {
		name: "Prime",
		amountMinor: 149900,
		category: "entertainment",
		cadence: { unit: "month", every: 12 },
		startDate: shiftMonths(primeDue, -12),
		backfill: false,
		due: primeDue,
	});
	const old = await create(page, {
		name: "Old Plan",
		amountMinor: 30000,
		category: "utilities",
		cadence: { unit: "month", every: 1 },
		startDate: shiftMonths(dueAhead(5), -3),
		backfill: true,
		due: dueAhead(5),
	});
	await endYesterday(page, old);
	await open(page, path);
	return { account, netflix, gym, prime, old };
}

/** A new user with golden's profile and no Subscription, on `/subscriptions`. */
export async function userWithNoSubscriptions(
	page: Page,
	path = "/subscriptions",
): Promise<{ account: Account }> {
	const { account, userId } = await signUpByApi(page);
	await withDatabase("DATABASE_URL_SYSTEM", (client) =>
		insertProfile(client, userId, { today: today() }),
	);
	await open(page, path);
	return { account };
}

/** A row of the list or the table by the Subscription's id. */
export const row = (page: Page, made: Made): Locator =>
	page.locator(`[role="row"][data-key="${made.id}"]`);

/** The list's grid (BR-F05-37). */
export const list = (page: Page) =>
	page.getByRole("grid", { name: "Subscriptions" });

/** The docked panel (BR-F05-40). */
export const panel = (page: Page) =>
	page.getByRole("complementary", { name: "Subscription" });

/** The drawer below 1180 px, which carries the same name. */
export const drawer = (page: Page) =>
	page.getByRole("dialog", { name: "Subscription", exact: true });

/** A dialog by its title. */
export const dialog = (page: Page, name: string | RegExp) =>
	page.getByRole("dialog", { name });

/** The conflict view's dialog (BR-F05-34). */
export const conflictView = (page: Page) =>
	page.getByRole("dialog", {
		name: "This Subscription changed on another device",
	});

/** The inline notice that reads `text` (BR-F05-33): a status, never a toast. */
export const notice = (page: Page, text: string | RegExp) =>
	page.getByRole("status").filter({ hasText: text });

/** Waits until the page shows a notice with `text`. */
export async function expectNotice(page: Page, text: string | RegExp) {
	await expect(notice(page, text)).toBeVisible();
}

/** The header's Add button, which is an icon alone below 768 px. */
export const addButton = (page: Page) =>
	page.getByRole("button", { name: "Add a Subscription" }).first();

/** Presses a view's radio by its label, as a user does: React Aria draws its own control over
 * the hidden input. */
export const chooseView = (page: Page, view: "List" | "Calendar" | "Table") =>
	page
		.getByRole("radio", { name: view })
		.locator("xpath=ancestor::label[1]")
		.click();

/** The Subscription's row menu button. */
export const menuOf = (page: Page, made: Made) =>
	row(page, made).getByRole("button", { name: `Actions for ${made.name}` });

/** Chooses `item` in a row's menu. */
export async function pickMenuItem(
	page: Page,
	made: Made,
	item: string | RegExp,
): Promise<void> {
	await menuOf(page, made).click();
	await page.getByRole("menuitem", { name: item }).click();
}

/** Selects a row unless it is selected already: a second press on a selected row clears it. */
export async function selectRow(page: Page, made: Made): Promise<void> {
	const target = row(page, made);
	if ((await target.getAttribute("aria-selected")) !== "true")
		await target.click();
}

/** The width a second window opens at, a desktop's. */
const DESKTOP = { width: 1440, height: 1000 };

/** A second window of the same user, as another device would be: the same session, on the page
 * `path`, hydrated. */
export async function secondWindow(
	context: BrowserContext,
	path = "/subscriptions",
	viewport = DESKTOP,
): Promise<Page> {
	const other = await context.newPage();
	await other.setViewportSize(viewport);
	await open(other, path);
	return other;
}

/** Renames `made` in `page`'s Edit dialog, as the other window does to make it stale. */
export async function renameIn(page: Page, made: Made, name: string): Promise<void> {
	await selectRow(page, made);
	await panel(page).getByRole("button", { name: "Edit" }).click();
	const edit = dialog(page, `Edit ${made.name}`);
	const box = edit
		.getByRole("combobox", { name: "Name" })
		.or(edit.getByRole("textbox", { name: "Name" }));
	await box.fill(name);
	await edit.getByRole("button", { name: "Save changes" }).click();
	await expect(edit).toBeHidden();
}

/** Whether the page scrolls sideways, which a phone layout must never do. */
export const scrollsSideways = (page: Page) =>
	page.evaluate(
		() =>
			document.documentElement.scrollWidth
			> document.documentElement.clientWidth,
	);

/** The Undo button of a notice in `scope`: exact, since the timeline's "Undo skip" also holds
 * the word. */
export const undoButton = (scope: Locator | Page) =>
	scope.getByRole("button", { name: "Undo", exact: true });

/**
 * Opens the Add dialog and moves on from the Name box, whose list of payees opens with the
 * dialog and covers the rest of it until focus leaves (BR-F05-24).
 */
export async function openAdd(page: Page): Promise<Locator> {
	await addButton(page).click();
	const add = dialog(page, "Add a Subscription");
	await expect(add.getByRole("combobox", { name: "Name" })).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(add.getByRole("textbox", { name: "Amount" })).toBeVisible();
	return add;
}

/** Fills an open Add dialog: a name, an amount and a category tile. */
export async function fillAdd(
	page: Page,
	add: Locator,
	{
		name,
		amount,
		category = "Entertainment",
	}: {
		name: string;
		amount: string;
		category?: string;
	},
): Promise<void> {
	await add.getByRole("combobox", { name: "Name" }).fill(name);
	// Moving on closes the list that matching names open.
	await page.keyboard.press("Tab");
	await add.getByRole("textbox", { name: "Amount" }).fill(amount);
	// React Aria draws its own tile over the hidden radio, which takes the press.
	await add
		.getByRole("radio", { name: category })
		.locator("xpath=ancestor::label[1]")
		.click();
}

/** Adds a Subscription through the dialog and waits for it to close. */
export async function addSubscription(
	page: Page,
	details: { name: string; amount: string; category?: string },
): Promise<void> {
	const add = await openAdd(page);
	await fillAdd(page, add, details);
	await add.getByRole("button", { name: "Add Subscription" }).click();
	await expect(add).toBeHidden();
}
