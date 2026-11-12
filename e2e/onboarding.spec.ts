import { newAccount, signUp } from "./accounts";
import { expect, test } from "./fixtures";
import { choose } from "./transactions";

test.describe("onboarding from India with an American browser", () => {
	test.use({ timezoneId: "Asia/Kolkata", locale: "en-US" });

	// AC-F02-08
	test("pre-fills IN, INR, Kolkata and Sunday, and Start opens /transactions", async ({
		page,
	}) => {
		await signUp(page, newAccount());
		await expect(page.getByRole("combobox", { name: "Country" })).toHaveValue(
			"India",
		);
		await expect(page.getByRole("button", { name: /Currency/ })).toContainText(
			"Indian rupee (INR)",
		);
		await expect(page.getByText("Kolkata (GMT+05:30)")).toBeVisible();
		await expect(page.getByRole("radio", { name: "Sunday" })).toBeChecked();
		await page.getByRole("button", { name: "Start using Daybook" }).click();
		await expect(page).toHaveURL("/transactions");
		await expect(
			page.getByRole("heading", { name: "Transactions", level: 1 }),
		).toBeVisible();
	});

	// D-511
	test("the top bar shows the email, and the Preview shows India's formats", async ({
		page,
	}) => {
		const account = newAccount();
		await signUp(page, account);
		const bar = page.getByRole("banner");
		await expect(bar.getByText(account.email)).toBeVisible();
		await expect(bar.getByRole("link")).toHaveCount(0);
		const preview = page.getByRole("region", { name: "Preview" });
		// Screen readers hear the sample amount whole; its styled pieces are hidden from them.
		await expect(
			preview.locator(".sr-only", { hasText: "₹1,00,000.00" }),
		).toBeAttached();
		await expect(preview.getByText("−₹1,240.50")).toBeVisible();
		await expect(preview.getByText("Kolkata time (GMT+05:30)")).toBeVisible();
		await expect(preview.locator('[aria-current="date"]')).toHaveCount(1);
		await choose(page, "radio", "Monday");
		await expect(preview.getByRole("listitem").first()).toContainText("Mon");
	});

	// D-511, BR-F02-01
	test("Log out leaves onboarding for login, and the session is gone", async ({
		page,
	}) => {
		await signUp(page, newAccount());
		await page.getByRole("button", { name: "Log out" }).click();
		await expect(page).toHaveURL("/login");
		await page.goto("/onboarding");
		await expect(page).toHaveURL(/\/login\?next=%2Fonboarding/);
	});

	// AC-F02-08
	test("once onboarded, /onboarding redirects away", async ({ page }) => {
		await signUp(page, newAccount());
		await page.getByRole("button", { name: "Start using Daybook" }).click();
		await expect(page).toHaveURL("/transactions");
		await page.goto("/onboarding");
		await expect(page).toHaveURL("/transactions");
	});
});

test.describe("onboarding from Germany", () => {
	test.use({ timezoneId: "Europe/Berlin", locale: "de-DE" });

	test("pre-fills DE, EUR, Berlin and Monday", async ({ page }) => {
		await signUp(page, newAccount());
		await expect(page.getByRole("combobox", { name: "Country" })).toHaveValue(
			"Germany",
		);
		await expect(page.getByRole("button", { name: /Currency/ })).toContainText(
			"EUR",
		);
		await expect(page.getByRole("radio", { name: "Monday" })).toBeChecked();
	});

	test("choosing another country re-derives the untouched fields", async ({
		page,
	}) => {
		await signUp(page, newAccount());
		const country = page.getByRole("combobox", { name: "Country" });
		await country.fill("Japan");
		await page.getByRole("option", { name: "Japan" }).click();
		await expect(country).toHaveValue("Japan");
		await expect(page.getByRole("button", { name: /Currency/ })).toContainText(
			"JPY",
		);
		await expect(page.getByText("Tokyo (GMT+09:00)")).toBeVisible();
		await expect(page.getByRole("radio", { name: "Sunday" })).toBeChecked();
	});
});

test("a logged-in user without a profile is sent to onboarding from any app page", async ({
	page,
}) => {
	await signUp(page, newAccount());
	await page.goto("/budgets");
	await expect(page).toHaveURL("/onboarding");
});

test("offline, onboarding is disabled with its line", async ({ page, context }) => {
	await signUp(page, newAccount());
	await context.setOffline(true);
	await expect(
		page.getByText("You are offline. Connect to finish setup."),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Start using Daybook" }),
	).toBeDisabled();
	await expect(
		page.getByRole("button", { name: "Start using Daybook" }),
	).toHaveAccessibleDescription("Connect to finish setup.");
	await context.setOffline(false);
	await expect(
		page.getByRole("button", { name: "Start using Daybook" }),
	).toBeEnabled();
});

// D-511
test.describe("a browser whose country can't be guessed", () => {
	test.use({ timezoneId: "UTC", locale: "en-001" });

	test("waits for a country, asks for it from Start, then saves", async ({
		page,
	}) => {
		await signUp(page, newAccount());
		const country = page.getByRole("combobox", { name: "Country" });
		const start = page.getByRole("button", { name: "Start using Daybook" });
		await expect(country).toHaveValue("");
		for (const name of [/Currency/, /Time zone/]) {
			const field = page.getByRole("button", { name });
			await expect(field).toContainText("Choose a country first");
			await expect(field).toBeDisabled();
		}
		await expect(start).toHaveAccessibleDescription(
			"Choose your country first.",
		);
		await expect(
			page.getByText(
				"Choose your country to see how amounts and dates will look.",
			),
		).toBeVisible();

		// Playwright waits for an enabled button to click, so press it from the keyboard.
		await start.focus();
		await page.keyboard.press("Enter");
		await expect(country).toHaveAccessibleDescription("Choose your country.");
		await expect(country).toBeFocused();

		await country.fill("Atlantis");
		await page.keyboard.press("Escape");
		await country.fill("Atlantis");
		await page.keyboard.press("Tab");
		await expect(country).toHaveAccessibleDescription(
			"Choose a country from the list.",
		);

		await country.fill("India");
		await page.getByRole("option", { name: "India", exact: true }).click();
		await expect(page.getByRole("button", { name: /Currency/ })).toContainText(
			"Indian rupee (INR)",
		);
		await expect(start).toBeEnabled();
		await start.click();
		await expect(page).toHaveURL("/transactions");
	});
});
