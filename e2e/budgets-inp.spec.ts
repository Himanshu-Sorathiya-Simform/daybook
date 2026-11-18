import { type Page } from "@playwright/test";

import { userWithStress } from "./data";
import { expect, test } from "./fixtures";
import {
	closeWithEscape,
	INP_BUDGET_MS,
	type Interaction,
	recordInteractions,
	REPETITIONS,
	throttleCpu,
	worstInteraction,
	worstOf,
} from "./inp";
import { currentMonth, dialog, limitBox, monthName, panel, row } from "./budgets";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	// A step that cannot be done fails in seconds, not after the test's whole limit.
	actionTimeout: 20_000,
	viewport: { width: 1440, height: 1000 },
});

/** Selects Food's row unless it is selected already: a second press would clear it. */
async function selectFood(page: Page) {
	const food = row(page, "budget:food");
	if ((await food.getAttribute("aria-selected")) !== "true") await food.click();
}

/** Runs `step` REPETITIONS times and reports the worst. */
async function repeat(step: (run: number) => Promise<Interaction>) {
	const runs: Interaction[] = [];
	for (let run = 0; run < REPETITIONS; run++) runs.push(await step(run));
	return worstOf(runs);
}

// AC-F04-32, D-580: a lab measurement, one run in Chromium with the CPU slowed 4×, plus a hand
// check in DevTools Performance; the worst of 5 repetitions counts. Each interaction is measured
// on its own, so a slow one is named.
test("a state count, a row, a table heading and a saved change stay within INP 200 ms on the stress account with golden's Budgets", async ({
	page,
}) => {
	test.setTimeout(600_000);
	await recordInteractions(page);
	await userWithStress(page, { path: "/budgets", budgets: true });
	await expect(page.getByText(/^Budgeted spending in /)).toBeVisible();
	await throttleCpu(page);

	const results: Record<string, Interaction> = {};

	results["press a state count"] = await repeat(async () => {
		const pressed = await worstInteraction(page, async () => {
			await page.getByRole("button", { name: /^On track/ }).click();
			await expect(page.getByText("Showing", { exact: true })).toBeVisible();
		});
		// The same count again takes the filter off.
		await page.getByRole("button", { name: /^On track/ }).click();
		await expect(page.getByText("Showing", { exact: true })).toBeHidden();
		return pressed;
	});

	results["select a row"] = await repeat(async () => {
		const selected = await worstInteraction(page, async () => {
			await row(page, "budget:food").click();
			await expect(panel(page)).toContainText("Where it went");
		});
		await page.keyboard.press("Escape");
		await expect(row(page, "budget:food")).toHaveAttribute(
			"aria-selected",
			"false",
		);
		return selected;
	});

	results["switch to Table"] = await worstInteraction(page, async () => {
		await page
			.getByRole("radio", { name: "Table" })
			.locator("xpath=ancestor::label[1]")
			.click();
		await expect(
			page.getByRole("grid", { name: /Select a column heading/ }),
		).toBeVisible();
	});
	results["press a table heading"] = await repeat(async (run) => {
		const spent = page.getByRole("columnheader", { name: /^Spent/ });
		const sort = ["descending", "ascending", "none"][run % 3]!;
		return worstInteraction(page, async () => {
			await spent.click();
			await expect(spent).toHaveAttribute("aria-sort", sort);
		});
	});
	await page
		.getByRole("radio", { name: "List" })
		.locator("xpath=ancestor::label[1]")
		.click();

	results["open Change limit"] = await repeat(async () => {
		await selectFood(page);
		const opened = await worstInteraction(page, async () => {
			await panel(page).getByRole("button", { name: "Change limit" }).click();
			await expect(dialog(page, "Change the Food limit")).toBeVisible();
		});
		await closeWithEscape(page, dialog(page, "Change the Food limit"));
		return opened;
	});
	results["press Save on a change of limit"] = await repeat(async (run) => {
		await selectFood(page);
		await panel(page).getByRole("button", { name: "Change limit" }).click();
		const change = dialog(page, "Change the Food limit");
		await limitBox(change).fill(`${7000 + run * 100}`);
		const saved = await worstInteraction(page, async () => {
			await change
				.getByRole("button", {
					name: `Change from ${monthName(currentMonth())}`,
				})
				.click();
			await expect(change).toBeHidden();
			await expect(page.getByRole("status").first()).toBeVisible();
		});
		return saved;
	});

	// AC-F04-32 names four interactions; switching view and opening a dialog are reported, not
	// held to it.
	const named = [
		"press a state count",
		"select a row",
		"press a table heading",
		"press Save on a change of limit",
	];
	for (const [what, result] of Object.entries(results)) {
		const mark = named.includes(what) ? "" : " (observed only)";
		console.log(
			`INP Budgets, ${what}: ${Math.round(result.ms)} ms (${result.slowest})${mark}`,
		);
	}
	for (const what of named) {
		expect(results[what]!.ms, what).toBeLessThanOrEqual(INP_BUDGET_MS);
	}
});
