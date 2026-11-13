import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { isUuidV7 } from "@/lib/ids";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import {
	budgetAnswer,
	historyAnswer,
	monthAnswer,
} from "../../lib/__tests__/fixtures";
import type { DialogKind } from "../../lib/dialog";
import type { BudgetsLocale } from "../../lib/types";
import { BudgetDialog } from "../BudgetDialog";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
	// The limit's hint reads the category's last two months.
	route(network, "get", "/api/budgets/history", ({ path }) => {
		const query = new URL(path, "http://x").searchParams;
		return ok(
			historyAnswer(
				query.get("category") as ExpenseCategory,
				query.get("to") as Month,
				Number(query.get("months")),
			),
		);
	});
});
afterEach(() => {
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.restoreAllMocks();
});
afterAll(() => network.close());

// The golden profile on the golden clock's day (TST-3).
const IN: BudgetsLocale = {
	today: "2026-11-02",
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

function renderDialog(
	kind: DialogKind,
	category: ExpenseCategory | null,
	month: Month = "2026-10",
) {
	const handlers = {
		onClose: vi.fn(),
		onDeleteInstead: vi.fn(),
		onSaved: vi.fn(),
	};
	const view = renderInApp(
		<BudgetDialog
			isOpen
			kind={kind}
			category={category}
			view={monthAnswer(month)}
			locale={IN}
			{...handlers}
		/>,
	);
	return { ...view, ...handlers, user: userEvent.setup() };
}

const dialog = () => screen.getByRole("dialog");
const limitBox = () => screen.getByRole("textbox");
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const chip = (name: string | RegExp) => screen.getByRole("radio", { name });
const hint = () => screen.findByText(/^Spent /);

describe("Add a Budget (BR-F04-19)", () => {
	test("its title, category tiles with their spending, the limit and Apply from", () => {
		renderDialog("add", null, "2026-09");
		expect(dialog()).toHaveAccessibleName("Add a Budget");
		const tiles = within(screen.getByRole("radiogroup", { name: "Category" }));
		expect(tiles.getAllByRole("radio")).toHaveLength(12);
		expect(
			tiles.getByRole("radio", { name: "Health, ₹1,500.00 in Sept" }),
		).toBeVisible();
		expect(
			tiles.queryByRole("radio", { name: /^Food/ }),
		).not.toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Monthly limit" })).toBeVisible();
		expect(screen.getByRole("radiogroup", { name: "Apply from" })).toBeVisible();
		expect(
			screen.queryByRole("radiogroup", { name: "For how long" }),
		).not.toBeInTheDocument();
		expect(button("Add Budget from November")).toBeVisible();
	});

	test("Save with nothing filled says what is missing, sends nothing, and focuses the category", async () => {
		const posts = route(network, "post", "/api/budgets", () => ok({}));
		const { user } = renderDialog("add", null);
		await user.click(button("Add Budget from November"));
		expect(screen.getByText("Choose a category.")).toBeVisible();
		expect(screen.getByText("Enter a limit.")).toBeVisible();
		await waitFor(() =>
			expect(screen.getByRole("radio", { name: "Utilities" })).toHaveFocus(),
		);
		expect(posts).toHaveLength(0);
	});

	test("messages show only after the first Save, then follow the fields", async () => {
		const { user } = renderDialog("add", null);
		expect(screen.queryByText("Enter a limit.")).not.toBeInTheDocument();
		await user.click(button("Add Budget from November"));
		await user.type(limitBox(), "0");
		expect(screen.getByText("Enter an amount above zero.")).toBeVisible();
		await user.click(screen.getByText("Health"));
		expect(screen.queryByText("Choose a category.")).not.toBeInTheDocument();
	});

	// Flow 7.1
	test("Health, 1,500 and This month send a create from November, then close", async () => {
		const posts = route(network, "post", "/api/budgets", () =>
			ok(
				budgetAnswer("food", {
					id: "0192f1a0-0000-7000-8000-0000000000aa",
					category: "health",
					schedule: [{ from: "2026-11", limitMinor: 150000 }],
				}),
				201,
			),
		);
		const { user, onSaved, onClose } = renderDialog("add", null);
		await user.click(screen.getByText("Health"));
		expect(await hint()).toHaveTextContent(
			"Spent ₹0.00 in October and ₹1,500.00 in September.",
		);
		await user.type(limitBox(), "1500");
		await user.click(button("Add Budget from November"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(posts).toHaveLength(1);
		const body = posts[0]?.body as Record<string, unknown>;
		expect(body).toEqual({
			id: expect.any(String),
			category: "health",
			from: "2026-11",
			limitMinor: 150000,
			currency: "INR",
		});
		expect(isUuidV7(body["id"] as string)).toBe(true);
		expect(isUuidV7(posts[0]?.headers.get("idempotency-key"))).toBe(true);
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ category: "health" }),
		);
	});

	test("opened from a Not budgeted row, its category is chosen", () => {
		renderDialog("add", "housing");
		expect(chip(/^Housing/)).toBeChecked();
	});

	test("a category with a Budget record asks for how long and sends a change", async () => {
		const transportation = goldenBudget("transportation");
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("transportation", { version: 2 })),
		);
		const { user, onClose } = renderDialog("add", null, "2026-09");
		await user.click(screen.getByText("Transportation"));
		expect(
			screen.getByRole("radiogroup", { name: "For how long" }),
		).toBeVisible();
		await user.type(limitBox(), "3000");
		await user.click(button("Add Budget from November"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches[0]?.path).toBe(`/api/budgets/${transportation.id}`);
		expect(patches[0]?.headers.get("if-match")).toBe(
			`"${transportation.version}"`,
		);
		expect(patches[0]?.body).toEqual({
			from: "2026-11",
			limitMinor: 300000,
			currency: "INR",
		});
	});

	test("one month only on a category with a record reads Add for … only", async () => {
		const { user } = renderDialog("add", null, "2026-09");
		await user.click(screen.getByText("Transportation"));
		await user.type(limitBox(), "3000");
		await user.click(chip(/^One month only/));
		expect(button("Add for November only")).toBeVisible();
		expect(screen.getByRole("radiogroup", { name: "Month" })).toBeVisible();
	});

	// Flow 7.1, step 4
	test("budget_exists reopens it as Change limit on the Budget found, keeping what was typed", async () => {
		const found = budgetAnswer("food", {
			id: "0192f1a0-0000-7000-8000-0000000000bb",
			category: "health",
			version: 3,
			schedule: [{ from: "2026-09", limitMinor: 100000 }],
		});
		route(network, "post", "/api/budgets", () =>
			refuse(409, "budget_exists", { details: { current: found } }),
		);
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok({ ...found, version: 4 }),
		);
		const { user, onClose } = renderDialog("add", null);
		await user.click(screen.getByText("Health"));
		await user.type(limitBox(), "1500");
		await user.click(button("Add Budget from November"));
		expect(
			await screen.findByText(
				"A Health Budget already exists. We opened it so you can change it.",
			),
		).toBeVisible();
		expect(dialog()).toHaveAccessibleName("Change the Health limit");
		expect(
			screen.queryByRole("radiogroup", { name: "Category" }),
		).not.toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "New limit" })).toHaveValue(
			"1,500.00",
		);
		expect(
			screen.getByRole("radiogroup", { name: "For how long" }),
		).toBeVisible();
		await user.click(button("Change from November"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches[0]?.path).toBe(`/api/budgets/${found.id}`);
		expect(patches[0]?.headers.get("if-match")).toBe('"3"');
	});
});

describe("Change limit (BR-F04-20)", () => {
	test("golden Food in October: its title, the limit in force, its hint, For how long and Apply from", async () => {
		renderDialog("change", "food");
		expect(dialog()).toHaveAccessibleName("Change the Food limit");
		expect(screen.getByRole("textbox", { name: "New limit" })).toHaveValue(
			"5,000.00",
		);
		expect(await hint()).toHaveTextContent(
			"Spent ₹6,220.00 in October and ₹5,050.00 in September.",
		);
		const forHowLong = screen.getByRole("radiogroup", { name: "For how long" });
		expect(
			within(forHowLong).getByRole("radio", { name: "From a month onward" }),
		).toBeChecked();
		expect(forHowLong).toHaveTextContent("Carries on until you change it");
		expect(forHowLong).toHaveTextContent("December goes back to ₹5,000.00");
		expect(chip("This month (November)")).toHaveAttribute(
			"aria-checked",
			"true",
		);
	});

	test("focus starts in the limit", () => {
		renderDialog("change", "food");
		expect(limitBox()).toHaveFocus();
	});

	test("Add starts with no focus in the limit, the category coming first", () => {
		renderDialog("add", null);
		expect(limitBox()).not.toHaveFocus();
	});

	test("the viewed month's limit starts it: September's 6,000.00", () => {
		renderDialog("change", "food", "2026-09");
		expect(limitBox()).toHaveValue("6,000.00");
	});

	// BR-F04-27, section 8
	test("the limit as it is changes nothing: the button is disabled and says so", () => {
		renderDialog("change", "food");
		expect(
			screen.getByText(
				"Food already has this limit from November 2026. Nothing changes.",
			),
		).toBeVisible();
		expect(button("Change from November")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});

	test("a new limit enables it; One month only renames it and the month field", async () => {
		const { user } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		expect(button("Change from November")).not.toHaveAttribute("aria-disabled");
		expect(screen.queryByText(/Nothing changes/)).not.toBeInTheDocument();
		await user.click(chip(/^One month only/));
		expect(button("Change November only")).toBeVisible();
		expect(screen.getByRole("radiogroup", { name: "Month" })).toBeVisible();
	});

	test("the typed limit is tidied when the box loses focus", async () => {
		const { user } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		await user.tab();
		expect(limitBox()).toHaveValue("7,000.00");
	});

	test("an untidy limit stays as typed", async () => {
		const { user } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "7,00,0");
		await user.tab();
		expect(limitBox()).toHaveValue("7,00,0");
	});

	// Flow 7.3
	test("One month only for October (viewing), 8,000: the detail follows the month and the change is for October alone", async () => {
		const food = goldenBudget("food");
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("food", { version: 2 })),
		);
		const { user, onClose } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "8000");
		await user.click(chip(/^One month only/));
		await user.click(chip("October (viewing)"));
		expect(
			screen.getByRole("radiogroup", { name: "For how long" }),
		).toHaveTextContent("November goes back to ₹5,000.00");
		await user.click(button("Change October only"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches[0]?.path).toBe(`/api/budgets/${food.id}`);
		expect(patches[0]?.body).toEqual({
			month: "2026-10",
			limitMinor: 800000,
			currency: "INR",
			scope: "month",
		});
	});

	// Flow 7.2
	test("7,000 from September through Other month sends a change from September", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("food", { version: 2 })),
		);
		const { user, onClose } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		await user.click(chip("Other month"));
		await user.click(screen.getByRole("option", { name: /September/ }));
		expect(chip("September")).toHaveAttribute("aria-checked", "true");
		await user.click(button("Change from September"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches[0]?.body).toEqual({
			from: "2026-09",
			limitMinor: 700000,
			currency: "INR",
		});
	});

	test("submitting the form saves, as Enter in the limit does", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("food", { version: 2 })),
		);
		const { user, onClose } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		fireEvent.submit(screen.getByRole("form"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(1);
	});

	test("submitting does nothing when nothing would change", () => {
		const patches = route(network, "patch", "/api/budgets/:id", () => ok({}));
		const { onClose } = renderDialog("change", "food");
		fireEvent.submit(screen.getByRole("form"));
		expect(patches).toHaveLength(0);
		expect(onClose).not.toHaveBeenCalled();
	});

	test("submitting does nothing offline", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const patches = route(network, "patch", "/api/budgets/:id", () => ok({}));
		renderDialog("stop", "entertainment");
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		fireEvent.submit(screen.getByRole("form"));
		await delay(50);
		expect(patches).toHaveLength(0);
	});
});

describe("Stop budgeting (BR-F04-21)", () => {
	// Flow 7.4
	test("Entertainment from November: no limit, Stop from, and a change with no limit", async () => {
		const entertainment = goldenBudget("entertainment");
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("entertainment", { version: 2 })),
		);
		const { user, onClose } = renderDialog("stop", "entertainment");
		expect(dialog()).toHaveAccessibleName("Stop budgeting Entertainment");
		expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		expect(screen.getByRole("radiogroup", { name: "Stop from" })).toBeVisible();
		await user.click(button("Stop from November"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches[0]?.path).toBe(`/api/budgets/${entertainment.id}`);
		expect(patches[0]?.body).toEqual({
			from: "2026-11",
			limitMinor: null,
			currency: "INR",
		});
	});

	test("one month only reads Stop … only", async () => {
		const { user } = renderDialog("stop", "entertainment");
		await user.click(chip(/^One month only/));
		await user.click(chip("October (viewing)"));
		expect(button("Stop October only")).toBeVisible();
	});

	test("from the first entry's month it would remove every month: Delete Budget instead", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () => ok({}));
		const { user, onDeleteInstead } = renderDialog("stop", "food");
		await user.click(chip("Other month"));
		await user.click(screen.getByRole("option", { name: /September/ }));
		expect(
			screen.getByText(
				"This would remove every month. Delete the Budget instead.",
			),
		).toBeVisible();
		const instead = button("Delete Budget instead");
		expect(instead).toHaveClass("text-neg", "border-neg");
		await user.click(instead);
		expect(onDeleteInstead).toHaveBeenCalledWith(
			expect.objectContaining({ id: goldenBudget("food").id }),
		);
		expect(patches).toHaveLength(0);
	});
});

describe("refusals and states (sections 6 and 8)", () => {
	async function changeFood(user: ReturnType<typeof userEvent.setup>) {
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		await user.click(button("Change from November"));
	}

	test("a 422 puts each message under its field, and the rest at the top", async () => {
		route(network, "patch", "/api/budgets/:id", () =>
			refuse(422, "validation_failed", {
				fields: {
					limitMinor: "The largest amount is 99,99,99,999.99.",
					from: "Choose a month from Nov 2023 to Nov 2027.",
					currency: "Use the profile's currency.",
				},
			}),
		);
		const { user, onClose } = renderDialog("change", "food");
		await changeFood(user);
		expect(
			await screen.findByText("The largest amount is 99,99,99,999.99."),
		).toBeVisible();
		expect(
			screen.getByText("Choose a month from Nov 2023 to Nov 2027."),
		).toBeVisible();
		expect(screen.getByText("Use the profile's currency.")).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
		await user.type(limitBox(), "1");
		expect(
			screen.queryByText("The largest amount is 99,99,99,999.99."),
		).not.toBeInTheDocument();
		await user.click(chip("Next month (December)"));
		expect(
			screen.queryByText("Choose a month from Nov 2023 to Nov 2027."),
		).not.toBeInTheDocument();
	});

	test("no answer keeps the dialog open with what was typed", async () => {
		route(network, "patch", "/api/budgets/:id", () => HttpResponse.error());
		const { user, onClose } = renderDialog("change", "food");
		await changeFood(user);
		expect(
			await screen.findByText(
				"The Budget could not be saved. Check your connection and try again. Your changes are still here.",
			),
		).toBeVisible();
		expect(limitBox()).toHaveValue("7,000.00");
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a 404 says it was deleted on another device, and the page's Budgets are read again", async () => {
		route(network, "patch", "/api/budgets/:id", () => refuse(404, "not_found"));
		const histories = route(
			network,
			"get",
			"/api/budgets/history",
			({ path }) => {
				const query = new URL(path, "http://x").searchParams;
				return ok(historyAnswer("food", query.get("to") as Month, 2));
			},
		);
		const { user } = renderDialog("change", "food");
		await hint();
		const before = histories.length;
		await changeFood(user);
		expect(
			await screen.findByText("This Budget was deleted on another device."),
		).toBeVisible();
		await waitFor(() => expect(histories.length).toBeGreaterThan(before));
	});

	test("a 409 says the save failed until the conflict view comes", async () => {
		route(network, "patch", "/api/budgets/:id", () =>
			refuse(409, "version_conflict", {
				details: { current: budgetAnswer("food", { version: 5 }) },
			}),
		);
		const { user } = renderDialog("change", "food");
		await changeFood(user);
		expect(
			await screen.findByText(/^The Budget could not be saved/),
		).toBeVisible();
	});

	test("a 401 is the app's to answer: the dialog stays and says nothing more", async () => {
		route(network, "patch", "/api/budgets/:id", () =>
			refuse(401, "unauthenticated"),
		);
		const { user, onClose } = renderDialog("change", "food");
		await changeFood(user);
		await waitFor(() =>
			expect(button("Change from November")).not.toHaveAttribute("aria-busy"),
		);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("while it saves, the button waits and Cancel is disabled", async () => {
		route(network, "patch", "/api/budgets/:id", async () => {
			await delay(100);
			return ok(budgetAnswer("food", { version: 2 }));
		});
		const { user, onClose } = renderDialog("change", "food");
		await changeFood(user);
		expect(button("Cancel")).toHaveAttribute("aria-disabled", "true");
		expect(limitBox()).toBeDisabled();
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	// D-241, section 6
	test("offline, it says so and Save is disabled, even with a change to save", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { user } = renderDialog("change", "food");
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		expect(screen.getByText("You are offline. Connect to save.")).toBeVisible();
		expect(button("Change from November")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});

	test("Cancel and Escape close it", async () => {
		const { user, onClose } = renderDialog("change", "food");
		await user.click(button("Cancel"));
		expect(onClose).toHaveBeenCalledOnce();
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledTimes(2);
	});
});
