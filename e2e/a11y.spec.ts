import { logOut, newAccount, signUp } from "./accounts";
import { scan } from "./axe";
import { expect, test } from "./fixtures";

const WIDTHS = [
	["phone", { width: 360, height: 740 }],
	["desktop", { width: 1280, height: 800 }],
] as const;

for (const theme of ["light", "dark"] as const) {
	for (const [size, viewport] of WIDTHS) {
		test.describe(`${theme}, ${size}`, () => {
			test.use({ viewport, colorScheme: theme });

			// AC-F01-16, AC-F02-17, AC-P3-05 (for the pages built so far)
			test("landing, sign-up, onboarding, the shell and login have no serious violation", async ({
				page,
			}) => {
				await page.goto("/");
				await scan(page, "/");
				await page.goto("/?deleted=1");
				await scan(page, "/?deleted=1");

				await page.goto("/signup");
				await scan(page, "/signup");
				await page.getByRole("button", { name: "Create account" }).click();
				await expect(page.getByText(/Enter/).first()).toBeVisible();
				await scan(page, "/signup with messages");

				await signUp(page, newAccount());
				await scan(page, "/onboarding");

				await page
					.getByRole("button", { name: "Start using Daybook" })
					.click();
				await expect(page).toHaveURL("/transactions");
				await scan(page, "/transactions");

				await page.getByRole("button", { name: "Account menu" }).click();
				await expect(page.getByRole("menu")).toBeVisible();
				await scan(page, "the account menu");
				await page.keyboard.press("Escape");

				if (size === "phone") {
					await page.getByRole("button", { name: "More" }).click();
					await expect(
						page.getByRole("dialog", { name: "More" }),
					).toBeVisible();
					await scan(page, "the More sheet");
					await page.keyboard.press("Escape");
				} else {
					await page
						.getByRole("button", { name: "Collapse sidebar" })
						.click();
					await scan(page, "the shell with the rail");
				}

				await logOut(page);
				await expect(page).toHaveURL("/login");
				await scan(page, "/login");
				await page.getByRole("button", { name: "Log in" }).click();
				await expect(page.getByText(/Enter/).first()).toBeVisible();
				await scan(page, "/login with messages");
				await page.goto("/login?expired=1");
				await scan(page, "/login?expired=1");
			});
		});
	}
}
