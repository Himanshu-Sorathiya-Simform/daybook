import { type Page, test } from "@playwright/test";

import { insertProfile, loadGolden, type LoadedGolden } from "../seed/load-golden";
import { type LoadedStress, loadStress } from "../seed/load-stress";
import { todayIn } from "@/lib/time";
import { type Account, newAccount } from "./accounts";
import { withDatabase } from "./db";

/**
 * Opens `path` and waits until the page has hydrated: until then the rows the server rendered
 * take no press. The signal is the payee suggestions' request, which only the running client
 * sends, once a logged-in page renders (BR-F03-76).
 */
export async function open(page: Page, path: string): Promise<void> {
	const hydrated = page.waitForResponse(
		(response) => new URL(response.url()).pathname === "/api/payees",
	);
	await page.goto(path);
	await hydrated;
}

/**
 * Signs `account` up through Better Auth's API, as the sign-up page does, and returns its user
 * id. The page's context keeps the session cookie. Faster than the form, which `auth.spec.ts`
 * covers; the account has no profile yet.
 */
export async function signUpByApi(
	page: Page,
	account: Account = newAccount(),
): Promise<{ account: Account; userId: string }> {
	const origin = test.info().project.use.baseURL!;
	const response = await page.request.post("/api/auth/sign-up/email", {
		data: {
			email: account.email,
			password: account.password,
			name: account.name,
		},
		headers: { origin },
	});
	if (!response.ok()) {
		throw new Error(
			`Sign-up answered ${response.status()}: ${await response.text()}`,
		);
	}
	const session = (await (
		await page.request.get("/api/auth/get-session")
	).json()) as {
		user: { id: string };
	};
	return { account, userId: session.user.id };
}

/**
 * A new user holding golden's profile and its 22 M1 Transactions (D-471), on `/transactions`
 * at `path`. The rows go straight into the database, since their September and October dates
 * lie outside the API's 10-day window. Golden's figures hold on any day for filters with
 * explicit dates (checks A to E, G and H); "Today" and presets follow the real clock.
 */
export async function userWithGolden(
	page: Page,
	path = "/transactions",
): Promise<{ account: Account; golden: LoadedGolden }> {
	const { account, userId } = await signUpByApi(page);
	const golden = await withDatabase("DATABASE_URL_SYSTEM", (client) =>
		loadGolden(client, userId),
	);
	await open(page, path);
	return { account, golden };
}

/** A new user holding the stress rows (`seed/stress.ts`), 1,000 unless `count` says, ending on
 * today in India, on `/transactions` at `path`. */
export async function userWithStress(
	page: Page,
	{ count, path = "/transactions" }: { count?: number; path?: string } = {},
): Promise<{ account: Account; stress: LoadedStress }> {
	const { account, userId } = await signUpByApi(page);
	const today = todayIn("Asia/Kolkata", new Date());
	const stress = await withDatabase("DATABASE_URL_SYSTEM", (client) =>
		loadStress(client, userId, {
			today,
			...(count === undefined ? {} : { count }),
		}),
	);
	await open(page, path);
	return { account, stress };
}

/** A new user with golden's profile and no Transactions, on `/transactions` at `path`: the
 * onboarding form's own path is covered by `onboarding.spec.ts`. */
export async function userWithProfile(
	page: Page,
	path = "/transactions",
): Promise<{ account: Account }> {
	const { account, userId } = await signUpByApi(page);
	const today = todayIn("Asia/Kolkata", new Date());
	await withDatabase("DATABASE_URL_SYSTEM", (client) =>
		insertProfile(client, userId, { today }),
	);
	await open(page, path);
	return { account };
}
