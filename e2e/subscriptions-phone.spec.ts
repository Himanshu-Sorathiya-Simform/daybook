import { expect, test } from "./fixtures";
import {
	addButton,
	addSubscription,
	conflictView,
	dialog,
	drawer,
	expectNotice,
	notice,
	renameIn,
	row,
	scrollsSideways,
	secondWindow,
	undoButton,
	userWithSubscriptions,
} from "./subscriptions";

test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	actionTimeout: 20_000,
	viewport: { width: 375, height: 740 },
	hasTouch: true,
});

// D-512, BR-F05-21: the phone layout.
test("the phone layout: the list only, an icon Add with a 44 px target, no sideways scroll", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await expect(row(page, netflix)).toBeVisible();
	await expect(page.getByRole("radio", { name: "Table" })).toBeHidden();
	const add = page.getByRole("button", { name: "Add a Subscription" }).first();
	await expect(add).toBeVisible();
	const box = await add.boundingBox();
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	expect(await scrollsSideways(page)).toBe(false);
});

// BR-F05-40, D-571: a tapped row opens the drawer.
test("a tapped row opens the drawer, which closes with Close details", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).tap();
	await expect(drawer(page)).toBeVisible();
	await expect(drawer(page)).toContainText("₹649.00");
	expect(await scrollsSideways(page)).toBe(false);
	await drawer(page).getByRole("button", { name: "Close details" }).click();
	await expect(drawer(page)).toBeHidden();
});

// D-400, D-512: dialogs are sheets with 44 px targets.
test("Add opens as a sheet from the bottom with 44 px targets and fits the width", async ({
	page,
}) => {
	await userWithSubscriptions(page);
	await addButton(page).tap();
	const add = dialog(page, "Add a Subscription");
	await expect(add).toBeVisible();
	await page.keyboard.press("Tab");
	const sheet = await add.boundingBox();
	expect((sheet?.y ?? 0) + (sheet?.height ?? 0)).toBeGreaterThan(700);
	const save = add.getByRole("button", { name: "Add Subscription" });
	expect((await save.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
	expect(await scrollsSideways(page)).toBe(false);
});

// BR-F05-33: below 1180 px with nothing selected the notice is above the list.
test("with nothing selected an Add opens no drawer and its notice is above the list; with the drawer open the drawer shows it", async ({
	page,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await addSubscription(page, { name: "Spotify", amount: "119" });
	await expectNotice(page, "Spotify added.");
	await expect(drawer(page)).toBeHidden();
	await undoButton(notice(page, "Spotify added.")).tap();
	await expect(notice(page, "Spotify added.")).toHaveCount(0);

	// With the drawer open it carries the notice.
	await row(page, netflix).tap();
	await expect(drawer(page)).toBeVisible();
	await drawer(page).getByRole("button", { name: "Skip this one" }).tap();
	await expect(
		drawer(page).getByRole("status").filter({ hasText: "Skipped the" }),
	).toBeVisible();
});

// BR-F05-34: the conflict view as a sheet.
test("the conflict view is a sheet that fits, with its choices in reach", async ({
	page,
	context,
}) => {
	const { netflix } = await userWithSubscriptions(page);
	await row(page, netflix).tap();
	await drawer(page).getByRole("button", { name: "Skip this one" }).tap();
	await expectNotice(page, "Skipped the");
	const other = await secondWindow(context);
	await renameIn(other, netflix, "Netflix HD");
	await drawer(page).getByRole("button", { name: "Undo", exact: true }).tap();
	await expect(conflictView(page)).toBeVisible();
	expect(await scrollsSideways(page)).toBe(false);
	for (const name of ["Keep mine", "Keep theirs"]) {
		const box = await conflictView(page)
			.getByRole("button", { name })
			.boundingBox();
		expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
		expect((box?.x ?? 0) + (box?.width ?? 0), name).toBeLessThanOrEqual(375);
	}
});
