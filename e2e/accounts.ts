import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

/** A new account's details. Each test signs up its own user in the Neon development database
 * (TST-6), so no test depends on another's data. The password is random, so the breached-
 * password check passes it. */
export type Account = { name: string; email: string; password: string };

export function newAccount(name = "Asha Rao"): Account {
	const id = randomUUID();
	return {
		name,
		email: `e2e-${id}@daybook.test`,
		password: `E2e-${id.slice(0, 18)}`,
	};
}

/** Signs up through `/signup` and waits for onboarding (F01 flow 7.1). */
export async function signUp(page: Page, account: Account): Promise<void> {
	await page.goto("/signup");
	await page.getByLabel("Email").fill(account.email);
	await page.getByLabel("Password", { exact: true }).fill(account.password);
	await page.getByLabel("Display name").fill(account.name);
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(page).toHaveURL("/onboarding");
}

/** Accepts onboarding's pre-filled answers and waits for the shell (F02 flow 7.1). */
export async function onboard(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Start using Daybook" }).click();
	await expect(page).toHaveURL("/transactions");
}

/** A new user who has finished onboarding, on `/transactions`. */
export async function onboardedUser(page: Page, name?: string): Promise<Account> {
	const account = newAccount(name);
	await signUp(page, account);
	await onboard(page);
	return account;
}

/** Logs in through `/login`, waiting for `destination`. */
export async function logIn(
	page: Page,
	account: Account,
	destination = "/transactions",
): Promise<void> {
	await page.goto("/login");
	await page.getByLabel("Email").fill(account.email);
	await page.getByLabel("Password", { exact: true }).fill(account.password);
	await page.getByRole("button", { name: "Log in" }).click();
	await expect(page).toHaveURL(destination);
}

/** Opens the account menu and chooses Log out. */
export async function logOut(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Account menu" }).click();
	await page.getByRole("menuitem", { name: "Log out" }).click();
}

/** The session Better Auth sees for this browser context, or `null`. */
export async function sessionOf(
	page: Page,
): Promise<{ user: { email: string } } | null> {
	const response = await page.request.get("/api/auth/get-session");
	expect(response.ok()).toBe(true);
	return (await response.json()) as { user: { email: string } } | null;
}
