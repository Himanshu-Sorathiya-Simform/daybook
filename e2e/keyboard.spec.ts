import { newAccount } from "./accounts";
import { expect, test } from "./fixtures";
import { tabTo } from "./keyboard";

test.use({ timezoneId: "Asia/Kolkata", locale: "en-US" });

// AC-F01-16, AC-F02-17: sign-up, onboarding and login by keyboard alone
test("sign up, onboard, use the shell, log out and log in with the keyboard alone", async ({
	page,
}) => {
	const account = newAccount();

	await page.goto("/signup");
	await tabTo(page, page.getByLabel("Your name"));
	await page.keyboard.type(account.name);
	await tabTo(page, page.getByLabel("Email"));
	await page.keyboard.type(account.email);
	await tabTo(page, page.getByLabel("Password", { exact: true }));
	await page.keyboard.type(account.password);
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL("/onboarding");

	// Change the country and back from the keyboard, then start.
	const country = page.getByRole("combobox", { name: "Country" });
	await tabTo(page, country);
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("Japan");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(country).toHaveValue("Japan");
	// "India" also matches "British Indian Ocean Territory", which sorts first.
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("India");
	await page.keyboard.press("ArrowDown");
	while (
		!(await page
			.getByRole("option", { name: "India", exact: true })
			.getAttribute("data-focused"))
	) {
		await page.keyboard.press("ArrowDown");
	}
	await page.keyboard.press("Enter");
	await expect(country).toHaveValue("India");
	const start = page.getByRole("button", { name: "Start using Daybook" });
	await tabTo(page, start);
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL("/transactions");

	// The skip link leads past the navigation.
	await page.keyboard.press("Tab");
	await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("main")).toBeFocused();

	// A sidebar link, then the rail toggle, by keyboard.
	await page.keyboard.press("Shift+Tab");
	const budgets = page.getByRole("link", { name: "Budgets" });
	await page.locator("body").focus();
	await tabTo(page, budgets);
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL("/budgets");
	await tabTo(page, page.getByRole("button", { name: "Collapse sidebar" }));
	await page.keyboard.press("Enter");
	await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeFocused();

	// Log out from the account menu.
	const menuButton = page.getByRole("button", { name: "Account menu" });
	await tabTo(page, menuButton, 25);
	await page.keyboard.press("Enter");
	await expect(page.getByRole("menuitem", { name: "Log out" })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL("/login");

	await tabTo(page, page.getByLabel("Email"));
	await page.keyboard.type(account.email);
	await tabTo(page, page.getByLabel("Password", { exact: true }));
	await page.keyboard.type(account.password);
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL("/transactions");
});

test.describe("phone", () => {
	test.use({ viewport: { width: 360, height: 740 } });

	test("More opens, moves and closes by keyboard", async ({ page }) => {
		const account = newAccount();
		await page.goto("/signup");
		await page.getByLabel("Your name").fill(account.name);
		await page.getByLabel("Email").fill(account.email);
		await page.getByLabel("Password", { exact: true }).fill(account.password);
		await page.getByRole("button", { name: "Create account" }).click();
		await page.getByRole("button", { name: "Start using Daybook" }).click();
		await expect(page).toHaveURL("/transactions");

		const more = page.getByRole("button", { name: "More" });
		await page.locator("body").focus();
		await tabTo(page, more, 25);
		await page.keyboard.press("Enter");
		const sheet = page.getByRole("dialog", { name: "More" });
		await expect(sheet).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(sheet).toHaveCount(0);
		await expect(more).toBeFocused();
		await page.keyboard.press("Enter");
		await tabTo(page, sheet.getByRole("link", { name: "Reports" }));
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL("/reports");
		await expect(sheet).toHaveCount(0);
	});
});
