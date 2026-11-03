import { newAccount, signUp } from "./accounts";
import { expect, test } from "./fixtures";

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
		await expect(page.getByText(/Kolkata/)).toBeVisible();
		await expect(page.getByRole("radio", { name: "Sunday" })).toBeChecked();
		await page.getByRole("button", { name: "Start using Daybook" }).click();
		await expect(page).toHaveURL("/transactions");
		await expect(
			page.getByRole("heading", { name: "Transactions", level: 1 }),
		).toBeVisible();
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
		await expect(page.getByText(/Tokyo/)).toBeVisible();
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
	await context.setOffline(false);
	await expect(
		page.getByRole("button", { name: "Start using Daybook" }),
	).toBeEnabled();
});
