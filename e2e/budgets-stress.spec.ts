import { userWithStress } from "./data";
import { expect, test } from "./fixtures";
import { overviewLine, panel, row } from "./budgets";
import { figure, rows } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1440, height: 1000 },
});

// AC-F04-10 on a bigger account: the same figures as the Transactions list, with 1,000 rows.
test("on the stress account with golden's Budgets, Food's panel and its Transactions agree", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await userWithStress(page, { path: "/budgets", budgets: true });
	await expect(page.getByText(/^Budgeted spending in /)).toBeVisible();
	await expect(overviewLine(page)).toBeVisible();
	// Four Budgets are loaded, the rest of the categories with spending are Not budgeted.
	const budgeted = page
		.getByRole("grid", { name: "Budgets" })
		.locator('[role="row"][data-key^="budget:"]');
	await expect(budgeted).toHaveCount(4);

	await row(page, "budget:food").click();
	await expect(panel(page)).toContainText("Where it went");
	const spent = (await panel(page).locator("p").first().innerText()).match(
		/₹[\d,]+\.\d\d/,
	)![0];
	const link = panel(page).getByRole("link", { name: /^See \d+ Transactions?$/ });
	const count = Number((await link.innerText()).match(/\d+/)![0]);
	await link.click();

	await expect(page).toHaveURL(
		/\/transactions\?from=\d{4}-\d\d-01&to=\d{4}-\d\d-\d\d&cat=food$/,
	);
	await expect(rows(page).first()).toBeVisible();
	await expect(figure(page, "Count")).toHaveText(String(count));
	// Food has no refunds on this account, so spending and Out are the same sum.
	await expect(figure(page, "Out")).toHaveText(spent);
});

// BR-F04-15: the groups hold on a month with many categories.
test("the current month's Not budgeted rows are ordered by spending, highest first", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await userWithStress(page, { path: "/budgets", budgets: true });
	await expect(page.getByText(/^Budgeted spending in /)).toBeVisible();
	const amounts = await page
		.getByRole("grid", { name: "Budgets" })
		.locator('[role="row"][data-key^="unbudgeted:"]')
		.evaluateAll((elements) =>
			elements.map((element) => {
				const text = element.textContent ?? "";
				const match = [...text.matchAll(/₹([\d,]+)\.(\d\d)/g)].at(-1)!;
				return Number(`${match[1]!.replaceAll(",", "")}${match[2]}`);
			}),
		);
	expect(amounts.length).toBeGreaterThan(1);
	expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
});
