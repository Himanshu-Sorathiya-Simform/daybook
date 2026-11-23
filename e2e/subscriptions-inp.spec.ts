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
import { dialog, fillAdd, openAdd, panel } from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	// A step that cannot be done fails in seconds, not after the test's whole limit.
	actionTimeout: 20_000,
	viewport: { width: 1440, height: 1000 },
});

/** Runs `step` REPETITIONS times and reports the worst. */
async function repeat(step: (run: number) => Promise<Interaction>) {
	const runs: Interaction[] = [];
	for (let run = 0; run < REPETITIONS; run++) runs.push(await step(run));
	return worstOf(runs);
}

/** Adds a Subscription named `name` through the dialog, measuring the press on Add. */
async function addOne(page: Page, name: string): Promise<Interaction> {
	const add = await openAdd(page);
	await fillAdd(page, add, { name, amount: "119" });
	return worstInteraction(page, async () => {
		await add.getByRole("button", { name: "Add Subscription" }).click();
		await expect(add).toBeHidden();
		await expect(
			page.getByRole("status").filter({ hasText: `${name} added` }),
		).toBeVisible();
	});
}

// AC-F05-16, D-580: a lab measurement, one run in Chromium with the CPU slowed 4×; the worst of
// 5 repetitions counts. Each interaction is measured on its own, so a slow one is named.
test("saving a new Subscription and saving a change to one stay within INP 200 ms on the stress account", async ({
	page,
}) => {
	test.setTimeout(600_000);
	await recordInteractions(page);
	await userWithStress(page, { path: "/subscriptions" });
	await expect(
		page.getByRole("heading", { level: 1, name: "Subscriptions" }),
	).toBeVisible();
	await throttleCpu(page);

	const results: Record<string, Interaction> = {};

	let added = 0;
	results["press Add Subscription"] = await repeat(async () => {
		added += 1;
		const saved = await addOne(page, `Service ${added}`);
		await page.keyboard.press("Escape");
		return saved;
	});

	results["press Save on a change"] = await repeat(async (run) => {
		const target = page.getByRole("row", { name: /^Service 1,/ });
		if ((await target.getAttribute("aria-selected")) !== "true")
			await target.click();
		await page.keyboard.press("e");
		const edit = dialog(page, "Edit Service 1");
		await expect(
			edit.getByRole("button", { name: "Save changes" }),
		).not.toHaveAttribute("aria-disabled", "true");
		await edit.getByRole("textbox", { name: "Amount" }).fill(`${200 + run}`);
		const saved = await worstInteraction(page, async () => {
			await edit.getByRole("button", { name: "Save changes" }).click();
			await expect(edit).toBeHidden();
			await expect(
				page.getByRole("status").filter({ hasText: "Service 1 saved" }),
			).toBeVisible();
		});
		return saved;
	});

	results["select a row"] = await repeat(async () => {
		const target = page.getByRole("row", { name: /^Service 2,/ });
		const selected = await worstInteraction(page, async () => {
			await target.click();
			await expect(panel(page)).toContainText("Charges");
		});
		await page.keyboard.press("Escape");
		await expect(target).toHaveAttribute("aria-selected", "false");
		return selected;
	});

	results["open Edit"] = await repeat(async () => {
		const target = page.getByRole("row", { name: /^Service 2,/ });
		await target.click();
		const opened = await worstInteraction(page, async () => {
			await page.keyboard.press("e");
			await expect(dialog(page, "Edit Service 2")).toBeVisible();
		});
		await closeWithEscape(page, dialog(page, "Edit Service 2"));
		await page.keyboard.press("Escape");
		return opened;
	});

	// AC-F05-16 names the two saves; selecting a row and opening a dialog are reported only.
	const named = ["press Add Subscription", "press Save on a change"];
	for (const [what, result] of Object.entries(results)) {
		const mark = named.includes(what) ? "" : " (observed only)";
		console.log(
			`INP Subscriptions, ${what}: ${Math.round(result.ms)} ms (${result.slowest})${mark}`,
		);
	}
	for (const what of named) {
		expect(results[what]!.ms, what).toBeLessThanOrEqual(INP_BUDGET_MS);
	}
});
