import { onboardedUser, logOut, sessionOf } from "./accounts";
import { expect, test } from "./fixtures";

const ORDER = [
	"Dashboard",
	"Transactions",
	"Budgets",
	"Subscriptions",
	"Goals",
	"Investments",
	"Analytics",
	"Insights",
	"Reports",
	"Learn",
	"Settings",
];

test.describe("desktop", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("the sidebar lists every destination, and each opens its page in the shell", async ({
		page,
	}) => {
		await onboardedUser(page);
		const nav = page.getByRole("navigation", { name: "Main" });
		await expect(nav.getByRole("link")).toHaveText(ORDER);
		for (const name of ORDER.filter((item) => item !== "Dashboard")) {
			await nav.getByRole("link", { name }).click();
			await expect(
				page.getByRole("heading", { name, level: 1 }),
			).toBeVisible();
			await expect(nav.getByRole("link", { name })).toHaveAttribute(
				"aria-current",
				"page",
			);
			await expect(page).toHaveTitle(`${name} · Daybook`);
		}
	});

	// D-241
	test("Dashboard opens Transactions until M3", async ({ page }) => {
		await onboardedUser(page);
		await page
			.getByRole("navigation", { name: "Main" })
			.getByRole("link", {
				name: "Dashboard",
			})
			.click();
		await expect(page).toHaveURL("/transactions");
	});

	test("moving between pages keeps the shell mounted, with no full page load", async ({
		page,
	}) => {
		await onboardedUser(page);
		await page.evaluate(() => {
			(window as unknown as { marker: number }).marker = 1;
		});
		await page.getByRole("link", { name: "Goals" }).click();
		await expect(page).toHaveURL("/goals");
		expect(
			await page.evaluate(
				() => (window as unknown as { marker?: number }).marker,
			),
		).toBe(1);
	});

	// D-513
	test("the rail choice survives a reload and a logout", async ({ page }) => {
		const account = await onboardedUser(page);
		await page.getByRole("button", { name: "Collapse sidebar" }).click();
		await expect(
			page.getByRole("button", { name: "Expand sidebar" }),
		).toBeVisible();
		await page.reload();
		await expect(
			page.getByRole("button", { name: "Expand sidebar" }),
		).toBeVisible();
		await logOut(page);
		await expect(page).toHaveURL("/login");
		await page.getByLabel("Email").fill(account.email);
		await page.getByLabel("Password", { exact: true }).fill(account.password);
		await page.getByRole("button", { name: "Log in" }).click();
		await expect(page).toHaveURL("/transactions");
		await expect(
			page.getByRole("button", { name: "Expand sidebar" }),
		).toBeVisible();
	});

	test("the account menu shows the name and email", async ({ page }) => {
		const account = await onboardedUser(page, "Meera Iyer");
		const button = page.getByRole("button", { name: "Account menu" });
		await expect(button.locator('[aria-hidden="true"]')).toHaveText("MI");
		await button.click();
		const menu = page.getByRole("menu", { name: "Account menu" });
		await expect(menu.getByText("Meera Iyer")).toBeVisible();
		await expect(menu.getByText(account.email)).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(menu).toHaveCount(0);
		await expect(button).toBeFocused();
	});

	test("a logged-out visitor on an app page goes to login with next", async ({
		page,
	}) => {
		for (const path of ["/transactions", "/settings", "/learn"]) {
			await page.goto(path);
			await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
		}
	});
});

test.describe("phone", () => {
	test.use({ viewport: { width: 360, height: 740 } });

	test("the bottom bar replaces the sidebar, and More holds the rest", async ({
		page,
	}) => {
		await onboardedUser(page);
		const bar = page.getByRole("navigation", { name: "Main" });
		await expect(bar).toHaveCount(1);
		await expect(bar.getByRole("link")).toHaveText([
			"Dashboard",
			"Transactions",
			"Budgets",
		]);
		await bar.getByRole("button", { name: "More" }).click();
		const sheet = page.getByRole("dialog", { name: "More" });
		await expect(sheet.getByRole("link")).toHaveText(ORDER.slice(3));
		await sheet.getByRole("link", { name: "Goals" }).click();
		await expect(sheet).toHaveCount(0);
		await expect(page).toHaveURL("/goals");
		await expect(bar.getByRole("button", { name: "More" })).toHaveAttribute(
			"aria-current",
			"true",
		);
	});

	test("the page never sits under the bottom bar", async ({ page }) => {
		await onboardedUser(page);
		const main = page.getByRole("main");
		const bar = page.getByRole("navigation", { name: "Main" });
		const padding = await main.evaluate((element) =>
			Number.parseFloat(getComputedStyle(element).paddingBottom),
		);
		const height = (await bar.boundingBox())?.height ?? 0;
		expect(padding).toBeGreaterThanOrEqual(height);
	});
});

test.describe("logout (D-502)", () => {
	test("online, signs out and opens /login", async ({ page }) => {
		await onboardedUser(page);
		await logOut(page);
		await expect(page).toHaveURL("/login");
		expect(await sessionOf(page)).toBeNull();
		await page.goto("/transactions");
		await expect(page).toHaveURL("/login?next=%2Ftransactions");
	});

	test("a failed sign-out writes the marker, and the next page request revokes the session", async ({
		page,
		context,
	}) => {
		await onboardedUser(page);
		const session = (await context.cookies()).find((cookie) =>
			cookie.name.includes("session_token"),
		);
		expect(session).toBeDefined();
		await page.route("**/api/auth/sign-out", (route) => route.abort());
		const pages: string[] = [];
		page.on("request", (request) => {
			if (request.isNavigationRequest())
				pages.push(new URL(request.url()).pathname);
		});
		await logOut(page);
		await expect(page).toHaveURL("/login");
		await expect(
			page.getByText("Your session has expired. Log in to continue."),
		).toHaveCount(0);
		expect(pages).toEqual([
			"/login",
			"/dashboard",
			"/api/session/expired",
			"/login",
		]);
		const cookies = await context.cookies();
		expect(
			cookies.find((cookie) => cookie.name === "daybook_logout"),
		).toBeUndefined();
		expect(
			cookies.find((cookie) => cookie.name === session?.name),
		).toBeUndefined();
		await page.unroute("**/api/auth/sign-out");
		// The old token no longer works anywhere.
		await context.addCookies([session!]);
		expect(await sessionOf(page)).toBeNull();
	});

	test("offline, the tab shows login with the offline line, and revokes once back online", async ({
		page,
		context,
	}) => {
		await onboardedUser(page);
		await context.setOffline(true);
		await logOut(page);
		await expect(
			page.getByText("You are offline. Connect to log in."),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Log in", level: 1 }),
		).toBeVisible();
		await expect(page.getByRole("navigation")).toHaveCount(0);
		expect(page.url()).toMatch(/\/transactions$/);
		expect(
			(await context.cookies()).find(
				(cookie) => cookie.name === "daybook_logout",
			)?.value,
		).toBe("1");
		await context.setOffline(false);
		await expect(page).toHaveURL("/login");
		await expect(
			page.getByText("Your session has expired. Log in to continue."),
		).toHaveCount(0);
		expect(await sessionOf(page)).toBeNull();
		expect(
			(await context.cookies()).find(
				(cookie) => cookie.name === "daybook_logout",
			),
		).toBeUndefined();
	});
});

test.describe("session expiry (BR-F01-12, BR-F01-13)", () => {
	test("a session ended elsewhere shows the banner on the next check", async ({
		page,
		context,
	}) => {
		await onboardedUser(page);
		// Better Auth checks on focus at most once per 5 seconds.
		await page.waitForTimeout(5500);
		const other = await context.newPage();
		await other.request.post("/api/auth/sign-out", {
			headers: {
				origin: new URL(page.url()).origin,
				"content-type": "application/json",
			},
			data: {},
		});
		await other.close();
		await page.evaluate(() =>
			document.dispatchEvent(new Event("visibilitychange")),
		);
		const banner = page.getByText(
			"Your session has expired. Log in to keep saving changes.",
		);
		await expect(banner).toBeVisible();
		await page.getByRole("button", { name: "Log in" }).click();
		await expect(page).toHaveURL("/login?next=%2Ftransactions&expired=1");
		await expect(
			page.getByText("Your session has expired. Log in to continue."),
		).toBeVisible();
	});

	test("a page request with a revoked session goes through session-expired to login", async ({
		page,
		context,
	}) => {
		await onboardedUser(page);
		const session = (await context.cookies()).find((cookie) =>
			cookie.name.includes("session_token"),
		)!;
		await page.request.post("/api/auth/sign-out", {
			headers: {
				origin: new URL(page.url()).origin,
				"content-type": "application/json",
			},
			data: {},
		});
		await context.addCookies([session]);
		await page.goto("/budgets");
		await expect(page).toHaveURL("/login?next=%2Fbudgets&expired=1");
	});
});
