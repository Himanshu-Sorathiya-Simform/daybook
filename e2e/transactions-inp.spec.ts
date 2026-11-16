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
import { choose, control, rows } from "./transactions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	// A step that cannot be done fails in seconds, not after the test's whole limit.
	actionTimeout: 20_000,
	viewport: { width: 1280, height: 800 },
});

const entry = (page: Page) => page.getByRole("dialog", { name: "New Transaction" });

/** Runs `step` REPETITIONS times and reports the worst. */
async function repeat(step: (run: number) => Promise<Interaction>) {
	const runs: Interaction[] = [];
	for (let run = 0; run < REPETITIONS; run++) runs.push(await step(run));
	return worstOf(runs);
}

// AC-F03-25, D-580: a lab measurement, one run in Chromium with the CPU slowed 4×, plus a hand
// check in DevTools Performance; the worst of 5 repetitions counts. Each interaction is
// measured on its own, so a slow one is named.
test("applying a filter and saving a Transaction stay within INP 200 ms on the stress account", async ({
	page,
}) => {
	test.setTimeout(600_000);
	await recordInteractions(page);
	await userWithStress(page);
	await expect(rows(page)).toHaveCount(50);
	await throttleCpu(page);

	// Applying a filter: opening the control, ticking a category, and ticking it off again.
	const results: Record<string, Interaction> = {};
	results["open the Category filter"] = await repeat(async () => {
		const opened = await worstInteraction(page, async () => {
			await control(page, "Category").click();
			await expect(
				page.getByRole("dialog", { name: "Category" }),
			).toBeVisible();
		});
		await closeWithEscape(page, page.getByRole("dialog", { name: "Category" }));
		return opened;
	});
	// Ticking a category and closing the control applies it (BR-F03-39).
	results["apply a category filter"] = await repeat(async (run) => {
		await control(page, "Category").click();
		const popover = page.getByRole("dialog", { name: "Category" });
		await expect(popover).toBeVisible();
		const wanted = run % 2 === 0 ? /^Food/ : /^Shopping/;
		const applied = await worstInteraction(page, async () => {
			await choose(popover, "checkbox", wanted);
			await closeWithEscape(page, popover);
			await expect(page).toHaveURL(/cat=/);
		});
		await page.getByRole("button", { name: "Clear all" }).click();
		await expect(page).not.toHaveURL(/cat=/);
		return applied;
	});

	// Saving: opening the dialog, and pressing Save.
	results["open New Transaction"] = await repeat(async () => {
		const opened = await worstInteraction(page, async () => {
			await page
				.getByRole("banner")
				.getByRole("button", { name: "Add Transaction" })
				.click();
			await expect(entry(page)).toBeVisible();
		});
		await closeWithEscape(page, entry(page));
		return opened;
	});
	results["press Save"] = await repeat(async (run) => {
		await page
			.getByRole("banner")
			.getByRole("button", { name: "Add Transaction" })
			.click();
		const dialog = entry(page);
		await dialog.getByRole("textbox", { name: "Amount" }).fill(`${100 + run}`);
		const payee = dialog.getByRole("combobox", { name: "Payee" });
		await payee.fill("INP check");
		await payee.press("Escape");
		await choose(dialog, "radio", "Food");
		const saved = await worstInteraction(page, async () => {
			await dialog.getByRole("button", { name: "Save", exact: true }).click();
			await expect(page.getByText("Transaction saved.")).toBeVisible();
			await expect(dialog).toBeHidden();
		});
		return saved;
	});

	// AC-F03-25 names two interactions; opening a control or a dialog is reported, not held to it.
	const named = ["apply a category filter", "press Save"];
	for (const [what, result] of Object.entries(results)) {
		const mark = named.includes(what) ? "" : " (observed only)";
		console.log(
			`INP Transactions, ${what}: ${Math.round(result.ms)} ms (${result.slowest})${mark}`,
		);
	}
	for (const what of named) {
		expect(results[what]!.ms, what).toBeLessThanOrEqual(INP_BUDGET_MS);
	}
});
