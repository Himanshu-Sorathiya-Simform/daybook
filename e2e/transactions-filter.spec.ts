import { userWithGolden } from "./data";
import { expect, test } from "./fixtures";
import {
	choose,
	control,
	expectHeader,
	expectRows,
	list,
	query,
	requestsTo,
	rows,
	searchBox,
} from "./transactions";

// Golden's profile is India; its figures hold on any day for filters with explicit dates.
test.use({
	timezoneId: "Asia/Kolkata",
	locale: "en-IN",
	viewport: { width: 1280, height: 800 },
});

const CHECK_B = "/transactions?from=2026-10-01&to=2026-10-31&cat=food";

// Flow 7.7, golden check B, AC-F03-63 (what the page shows)
test("the check B link shows October's 4 food rows and Out ₹6,220.00", async ({
	page,
}) => {
	await userWithGolden(page, CHECK_B);

	await expectRows(page, [
		/^Swiggy, Food, 11:50 pm, −₹380\.00$/,
		/^Swiggy, Food, 10:15 pm, −₹640\.00$/,
		/^BigBasket, Food: Monthly groceries, .*, −₹2,900\.00$/,
		/^Zomato, Food, .*, −₹2,300\.00$/,
	]);
	await expectHeader(page, { count: 4, inText: "₹0.00", out: "₹6,220.00" });
	await expect(page.getByRole("button", { name: "Remove Food" })).toBeVisible();
});

const CHECK_A = "/transactions?from=2026-10-01&to=2026-10-31";

test.describe("search (BR-F03-38)", () => {
	// Golden checks D, G and H, through the box and its 300 ms wait.
	for (const [text, count, out, param] of [
		["swiggy", 4, "₹3,290.00", "q=swiggy"],
		["groceries", 2, "₹6,100.00", "q=groceries"],
		["649", 2, "₹1,298.00", "q=649"],
	] as const) {
		test(`“${text}” finds ${count} rows, Out ${out}`, async ({ page }) => {
			await userWithGolden(page);
			await searchBox(page).fill(text);

			await expect(page).toHaveURL(new RegExp(`\\?${param}$`));
			await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(
				count,
			);
			await expectHeader(page, { count, inText: "₹0.00", out });
		});
	}

	test("a 2-letter search says why and asks for nothing", async ({ page }) => {
		// The page's clock jumps past the search's wait, so the test does not sit through it.
		await page.clock.install();
		await userWithGolden(page);
		await expect(list(page)).toBeVisible();
		const lists = requestsTo(page, /^\/api\/transactions$/);

		await searchBox(page).fill("sw");

		await expect(
			page.getByText("Type at least 3 characters, or an amount."),
		).toBeVisible();
		await page.clock.fastForward(600);
		expect(lists).toEqual([]);
		expect(query(page)).toBe("");
	});

	test("/ focuses the box, and Escape clears it", async ({ page }) => {
		await userWithGolden(page, "/transactions?q=swiggy");
		await expect(searchBox(page)).toHaveValue("swiggy");

		await page.locator("body").click({ position: { x: 5, y: 5 } });
		await page.keyboard.press("/");
		await expect(searchBox(page)).toBeFocused();
		await page.keyboard.press("Escape");

		await expect(searchBox(page)).toHaveValue("");
		await expect(page).toHaveURL(/\/transactions$/);
	});
});

test.describe("the filter controls (BR-F03-39)", () => {
	test("Type: Income shows golden's 3 income rows, and its chip removes it", async ({
		page,
	}) => {
		await userWithGolden(page);
		await control(page, "Type").click();
		await choose(
			page.getByRole("dialog", { name: "Type" }),
			"checkbox",
			/^Income/,
		);
		await page.keyboard.press("Escape");

		await expect(page).toHaveURL(/\?type=income$/);
		await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(3);
		await expectHeader(page, {
			count: 3,
			inText: "₹1,82,000.00",
			out: "₹0.00",
		});

		await page.getByRole("button", { name: "Remove Income" }).click();
		await expect(page).toHaveURL(/\/transactions$/);
		await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(22);
	});

	// Golden check C, built from the controls.
	test("Category: Shopping over September and October gives check C", async ({
		page,
	}) => {
		await userWithGolden(page, "/transactions?from=2026-09-01&to=2026-10-31");
		await control(page, "Category").click();
		await choose(
			page.getByRole("dialog", { name: "Category" }),
			"checkbox",
			/^Shopping/,
		);
		await page.keyboard.press("Escape");

		await expect(page).toHaveURL(
			/\?from=2026-09-01&to=2026-10-31&cat=shopping$/,
		);
		await expectHeader(page, { count: 3, inText: "₹0.00", out: "₹5,400.00" });
	});

	test("Amount: a Min above Max says so and changes nothing", async ({ page }) => {
		// The page's clock jumps past the filter's wait, so the test does not sit through it.
		await page.clock.install();
		await userWithGolden(page);
		await control(page, "Amount").click();
		const amount = page.getByRole("dialog", { name: "Amount" });
		await amount.getByRole("textbox", { name: "Min" }).fill("900");
		await amount.getByRole("textbox", { name: "Max" }).fill("799.99");
		await amount.getByRole("textbox", { name: "Max" }).blur();

		await expect(
			amount.getByText("Choose a Min at or below Max."),
		).toBeVisible();
		await page.clock.fastForward(600);
		expect(query(page)).toBe("");
	});

	test("Amount: Min and Max filter by amount, both included", async ({ page }) => {
		await userWithGolden(page, CHECK_A);
		await control(page, "Amount").click();
		const amount = page.getByRole("dialog", { name: "Amount" });
		await amount.getByRole("textbox", { name: "Min" }).fill("640");
		await amount.getByRole("textbox", { name: "Max" }).fill("649");
		await amount.getByRole("textbox", { name: "Max" }).blur();

		await expect(page).toHaveURL(/&min=640(\.00)?&max=649(\.00)?$/);
		// #16 Netflix 649.00 and #24 Swiggy 640.00.
		await expectHeader(page, { count: 2, inText: "₹0.00", out: "₹1,289.00" });
	});

	// Golden check E.
	test("More: Subscription charges over October gives check E", async ({
		page,
	}) => {
		await userWithGolden(page, CHECK_A);
		await control(page, "More").click();
		await choose(
			page.getByRole("dialog", { name: "More" }),
			"radio",
			/^Subscription charges/,
		);
		await page.keyboard.press("Escape");

		await expect(page).toHaveURL(/&src=subscription$/);
		await expectHeader(page, { count: 3, inText: "₹0.00", out: "₹20,148.00" });
	});

	test("Clear all clears every filter, in one history entry", async ({ page }) => {
		await userWithGolden(page, `${CHECK_A}&cat=food&q=swiggy`);
		await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(2);

		await page.getByRole("button", { name: "Clear all" }).click();

		await expect(page).toHaveURL(/\/transactions$/);
		await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(22);
		await page.goBack();
		await expect(page).toHaveURL(/q=swiggy$/);
	});
});

test.describe("group and sort (BR-F03-39, BR-F03-55)", () => {
	// AC-F03-35 at M1: check A by category, heaviest first.
	test("check A by category puts the groups in section 5's order", async ({
		page,
	}) => {
		await userWithGolden(page, `${CHECK_A}&group=category`);

		await expect(list(page).getByRole("rowheader")).toHaveText([
			/^Salary/,
			/^Housing/,
			/^Food/,
			/^Shopping/,
			/^Entertainment/,
			/^Transportation/,
		]);
	});

	test("the menu sorts by amount, largest first, and the URL follows", async ({
		page,
	}) => {
		await userWithGolden(page, CHECK_A);
		await page.getByRole("button", { name: /^Group and sort/ }).click();
		await choose(page, "radio", "Largest first");
		await page.keyboard.press("Escape");

		await expect(page).toHaveURL(/&sort=amount/);
		await expect(rows(page).first()).toHaveAccessibleName(
			/^Acme Corp, Salary, .*\+₹85,000\.00$/,
		);
	});
});

test.describe("links with invalid filters (BR-F03-34, FIL-5)", () => {
	for (const [link, kept] of [
		["?cat=pizza", ""],
		["?from=2026-10-31&to=2026-10-01", ""],
		["?q=ab&cat=food", "?cat=food"],
		["?sort=amount&group=day", "?sort=amount"],
	] as const) {
		test(`${link} drops what is invalid, with the notice`, async ({ page }) => {
			await userWithGolden(page, `/transactions${link}`);

			const notice = page.getByText(
				"Some filters in this link weren't valid and were removed.",
			);
			await expect(notice).toBeVisible();
			await expect(page).toHaveURL(
				new RegExp(`/transactions${kept.replace("?", "\\?")}$`),
			);
			await page.getByRole("button", { name: "Dismiss" }).click();
			await expect(notice).toBeHidden();
		});
	}

	test("an empty cat is no filter, and no notice", async ({ page }) => {
		await userWithGolden(page, "/transactions?cat=");
		await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(22);
		await expect(
			page.getByText(
				"Some filters in this link weren't valid and were removed.",
			),
		).toBeHidden();
	});
});

test.describe("history (AC-F03-69, D-547)", () => {
	test("ticks in one visit to a menu are one entry; Back and Forward move between them", async ({
		page,
	}) => {
		await userWithGolden(page);
		await control(page, "Type").click();
		const type = page.getByRole("dialog", { name: "Type" });
		await choose(type, "checkbox", /^Expense/);
		await choose(type, "checkbox", /^Refund/);
		await page.keyboard.press("Escape");
		await expect(page).toHaveURL(/\?type=expense,refund$/);

		await page.goBack();
		await expect(page).toHaveURL(/\/transactions$/);
		await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(22);
		await page.goForward();
		await expect(page).toHaveURL(/\?type=expense,refund$/);
		await expect(list(page).locator('[role="row"][data-key]')).toHaveCount(19);
	});

	test("a reload keeps the filter, sort and group", async ({ page }) => {
		const link = `${CHECK_A}&cat=food&sort=amount&group=none`;
		await userWithGolden(page, link);
		await page.reload();

		await expect(page).toHaveURL(new RegExp(`${link.replace("?", "\\?")}$`));
		await expectHeader(page, { count: 4, inText: "₹0.00", out: "₹6,220.00" });
		await expect(rows(page).first()).toHaveAccessibleName(
			/BigBasket.*−₹2,900\.00$/,
		);
	});
});
