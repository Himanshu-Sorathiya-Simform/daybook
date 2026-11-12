import { logIn, newAccount, onboardedUser, sessionOf, signUp } from "./accounts";
import { clientAddress, expect, test } from "./fixtures";

// AC-F01-01
test("a new email signs up and lands on /onboarding with a session", async ({
	page,
}) => {
	const account = newAccount();
	await signUp(page, account);
	await expect(
		page.getByRole("heading", { name: "Set up Daybook" }),
	).toBeVisible();
	expect((await sessionOf(page))?.user.email).toBe(account.email);
});

// AC-F01-15
test("a logged-out visitor at / sees the landing page", async ({ page }) => {
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	expect(page.url()).toMatch(/\/$/);
	await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
	await expect(page.getByText("Your account was deleted.")).toHaveCount(0);
});

// AC-F01-15
test("a logged-in user at / is sent to /dashboard, which opens /transactions until M3", async ({
	page,
}) => {
	await onboardedUser(page);
	const response = await page.goto("/");
	const chain: string[] = [];
	for (let request = response?.request() ?? null; request;) {
		chain.unshift(new URL(request.url()).pathname);
		request = request.redirectedFrom();
	}
	expect(chain).toEqual(["/", "/dashboard", "/transactions"]);
	await expect(
		page.getByRole("heading", { name: "Transactions", level: 1 }),
	).toBeVisible();
});

// AC-F01-15
test("after deletion, /?deleted=1 shows the notice", async ({ page }) => {
	await page.goto("/?deleted=1");
	await expect(page.getByText("Your account was deleted.")).toBeVisible();
	await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
});

test("a signed-up user without a profile at / goes to /onboarding", async ({
	page,
}) => {
	await signUp(page, newAccount());
	await page.goto("/");
	await expect(page).toHaveURL("/onboarding");
});

test("logging in lands on /transactions, and a wrong password is refused", async ({
	browser,
	page,
}) => {
	const account = await onboardedUser(page);
	const fresh = await browser.newContext({
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
	});
	const other = await fresh.newPage();
	await other.goto("/login");
	await other.getByLabel("Email").fill(account.email);
	await other.getByLabel("Password", { exact: true }).fill(`${account.password}x`);
	await other.getByRole("button", { name: "Log in" }).click();
	await expect(other.getByText("Email or password is incorrect.")).toBeVisible();
	await logIn(other, account);
	expect((await sessionOf(other))?.user.email).toBe(account.email);
	await fresh.close();
});

// BR-F01-05, BR-F01-31: "Log in instead." takes the email along, once.
test("a taken email offers Log in instead, which opens login with that email", async ({
	browser,
	page,
}) => {
	const account = newAccount();
	await signUp(page, account);

	const fresh = await browser.newContext({
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
	});
	const other = await fresh.newPage();
	await other.goto("/signup");
	await other.getByLabel("Your name").fill("Asha");
	await other.getByLabel("Email").fill(account.email);
	await other.getByLabel("Password", { exact: true }).fill(account.password);
	await other.getByRole("button", { name: "Create account" }).click();
	await expect(other.getByLabel("Email")).toHaveAccessibleDescription(
		"An account with this email already exists. Log in instead.",
	);

	await other.getByRole("link", { name: "Log in instead." }).click();
	await expect(other).toHaveURL("/login");
	await expect(other.getByLabel("Email")).toHaveValue(account.email);
	await other.reload();
	await expect(other.getByLabel("Email")).toHaveValue("");
	await fresh.close();
});

test("a login with next goes back to that page", async ({ browser, page }) => {
	const account = await onboardedUser(page);
	const fresh = await browser.newContext({
		extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
	});
	const other = await fresh.newPage();
	await other.goto("/budgets");
	await expect(other).toHaveURL("/login?next=%2Fbudgets");
	await other.getByLabel("Email").fill(account.email);
	await other.getByLabel("Password", { exact: true }).fill(account.password);
	await other.getByRole("button", { name: "Log in" }).click();
	await expect(other).toHaveURL("/budgets");
	await expect(other.getByText("Budgets is coming soon.")).toBeVisible();
	await fresh.close();
});

test("a logged-in user at /login or /signup goes to the app", async ({ page }) => {
	await onboardedUser(page);
	await page.goto("/login");
	await expect(page).toHaveURL("/transactions");
	await page.goto("/signup");
	await expect(page).toHaveURL("/transactions");
});

// BR-F01-09: `next` values that resolve to `//other-site` are ignored.
test("a login with a disguised off-site next stays in the app", async ({
	browser,
	page,
}) => {
	const account = await onboardedUser(page);
	for (const next of [
		"/.//evil.example",
		"/%2e//evil.example",
		"//evil.example",
	]) {
		// A context and client address each, so the sign-in limit never counts them together.
		const fresh = await browser.newContext({
			extraHTTPHeaders: { "x-forwarded-for": clientAddress() },
		});
		const other = await fresh.newPage();
		await other.goto(`/login?${new URLSearchParams({ next })}`);
		await other.getByLabel("Email").fill(account.email);
		await other.getByLabel("Password", { exact: true }).fill(account.password);
		await other.getByRole("button", { name: "Log in" }).click();
		await expect(other).toHaveURL("/transactions");
		await fresh.close();
	}
});
