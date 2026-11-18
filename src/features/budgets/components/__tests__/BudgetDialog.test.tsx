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

import { AppProviders } from "@/components/app/AppProviders";
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
			expect.objectContaining({
				category: "health",
				text: "Health Budget added: ₹1,500.00 from November 2026.",
			}),
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

	// AC-F04-33
	test("Add with no category chosen starts on the first tile, the category coming first", () => {
		renderDialog("add", null);

		expect(screen.getAllByRole("radio")[0]).toHaveFocus();
		expect(limitBox()).not.toHaveFocus();
	});

	// AC-F04-33
	test("Add from a Not budgeted row, its category chosen, starts in the limit", () => {
		renderDialog("add", "health");

		expect(screen.getByRole("radio", { name: /^Health/ })).toBeChecked();
		expect(limitBox()).toHaveFocus();
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

	test("a confirmed stop hands over its notice, undone by a restoring change", async () => {
		route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("entertainment", { version: 2 })),
		);
		const { user, onSaved } = renderDialog("stop", "entertainment");
		await user.click(button("Stop from November"));
		await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ version: 2 }),
			{
				category: "entertainment",
				text: "Entertainment Budget stops from November 2026. Earlier months keep their limits.",
				inPanel: true,
				undo: {
					kind: "restore",
					id: goldenBudget("entertainment").id,
					version: 2,
					rules: {
						schedule: [{ from: "2026-09", limitMinor: 100000 }],
						overrides: [],
					},
				},
			},
		);
	});

	test("a stop for one month reads No limit … only", async () => {
		route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("entertainment", { version: 2 })),
		);
		const { user, onSaved } = renderDialog("stop", "entertainment");
		await user.click(chip(/^One month only/));
		await user.click(chip("October (viewing)"));
		await user.click(button("Stop October only"));
		await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
		expect(onSaved.mock.calls[0]?.[1].text).toBe(
			"Entertainment has no limit for October 2026 only.",
		);
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

describe("a draft keeps the Budget it was opened on (BR-F04-23, BR-P1-26)", () => {
	/** The month view after another device changed food: version 3, its limit now 9,000.00. */
	const elsewhere = () => {
		const view = monthAnswer("2026-10");
		return {
			...view,
			budgets: view.budgets.map((row) =>
				row.category === "food" ?
					{
						...row,
						version: 3,
						schedule: [
							...row.schedule,
							{ from: "2026-11", limitMinor: 900000 },
						],
					}
				:	row,
			),
		};
	};

	test("a refetch of the page while the dialog is open does not move its version", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("food", { version: 4 })),
		);
		const handlers = {
			onClose: vi.fn(),
			onDeleteInstead: vi.fn(),
			onSaved: vi.fn(),
		};
		const { rerender, navigate, queryClient } = renderInApp(
			<BudgetDialog
				isOpen
				kind="change"
				category="food"
				view={monthAnswer("2026-10")}
				locale={IN}
				{...handlers}
			/>,
		);
		const user = userEvent.setup();
		// Another device saved while this dialog was open, and the page read its change.
		rerender(
			<AppProviders
				navigate={navigate}
				queryClient={queryClient}
			>
				<BudgetDialog
					isOpen
					kind="change"
					category="food"
					view={elsewhere()}
					locale={IN}
					{...handlers}
				/>
			</AppProviders>,
		);
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		await user.click(button("Change from November"));
		await waitFor(() => expect(patches).toHaveLength(1));
		// Version 2, as it was opened on: the server can then see the other change.
		expect(patches[0]?.headers.get("if-match")).toBe('"2"');
	});

	test("a draft opened before the refetch also keeps the limit and categories it showed", async () => {
		const handlers = {
			onClose: vi.fn(),
			onDeleteInstead: vi.fn(),
			onSaved: vi.fn(),
		};
		const { rerender, navigate, queryClient } = renderInApp(
			<BudgetDialog
				isOpen
				kind="change"
				category="food"
				view={monthAnswer("2026-10")}
				locale={IN}
				{...handlers}
			/>,
		);
		rerender(
			<AppProviders
				navigate={navigate}
				queryClient={queryClient}
			>
				<BudgetDialog
					isOpen
					kind="change"
					category="food"
					view={elsewhere()}
					locale={IN}
					{...handlers}
				/>
			</AppProviders>,
		);
		expect(limitBox()).toHaveValue("5,000.00");
	});
});

describe("the conflict view (BR-F04-23, D-567, AC-F04-30)", () => {
	const FOOD = goldenBudget("food");
	/** The Budget saved now: another device added 5,500.00 from November, as version 5. */
	const saved = (version = 5) =>
		budgetAnswer("food", {
			version,
			schedule: [...FOOD.schedule, { from: "2026-11", limitMinor: 550000 }],
		});
	const conflict = (version = 5) =>
		refuse(409, "version_conflict", { details: { current: saved(version) } });
	const view = () =>
		screen.getByRole("dialog", {
			name: "This Budget changed on another device",
		});
	const noView = () =>
		expect(
			screen.queryByRole("dialog", {
				name: "This Budget changed on another device",
			}),
		).not.toBeInTheDocument();
	const rowOf = (name: RegExp) =>
		within(view())
			.getAllByRole("row")
			.find((each) => name.test(each.textContent ?? ""))!;

	/** Food at 7,000.00 from December, which meets the 409. */
	async function changeFromDecember(user: ReturnType<typeof userEvent.setup>) {
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		await user.click(chip("Next month (December)"));
		await user.click(button("Change from December"));
	}

	test("a 409 opens it over the dialog, which stays with what was typed", async () => {
		route(network, "patch", "/api/budgets/:id", () => conflict());
		const { user, onClose } = renderDialog("change", "food");
		await changeFromDecember(user);
		expect(
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			}),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(2);
	});

	test("shows the change over the Budget as it was opened beside the Budget saved now", async () => {
		route(network, "patch", "/api/budgets/:id", () => conflict());
		const { user } = renderDialog("change", "food");
		await changeFromDecember(user);
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		const december = within(rowOf(/Dec 2026/)).getAllByRole("cell");
		expect(december[0]).toHaveTextContent("₹7,000.00 from Dec 2026");
		expect(december[1]).toHaveTextContent("None");
		const november = within(rowOf(/Nov 2026/)).getAllByRole("cell");
		expect(november[0]).toHaveTextContent("None");
		expect(november[1]).toHaveTextContent("₹5,500.00 from Nov 2026");
		expect(rowOf(/Dec 2026/)).toHaveAttribute("data-differs", "true");
		expect(rowOf(/Nov 2026/)).toHaveAttribute("data-differs", "true");
		expect(rowOf(/Oct 2026/)).not.toHaveAttribute("data-differs");
		expect(
			within(view()).getByText(
				"Keep mine applies your change, ₹7,000.00 from December 2026, to the saved Budget.",
			),
		).toBeVisible();
	});

	test("Keep mine resends the same change at the saved version, under a new key", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", (_, index) =>
			index === 0 ? conflict() : ok(budgetAnswer("food", { version: 6 })),
		);
		const { user, onClose, onSaved } = renderDialog("change", "food");
		await changeFromDecember(user);
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		await user.click(within(view()).getByRole("button", { name: "Keep mine" }));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(2);
		expect(patches[1]?.headers.get("if-match")).toBe('"5"');
		expect(patches[1]?.body).toEqual(patches[0]?.body);
		expect(patches[1]?.headers.get("idempotency-key")).not.toBe(
			patches[0]?.headers.get("idempotency-key"),
		);
		expect(isUuidV7(patches[1]?.headers.get("idempotency-key"))).toBe(true);
		noView();
		expect(onSaved).toHaveBeenCalledOnce();
	});

	test("its notice's Undo puts back the Budget as it was saved when Keep mine ran", async () => {
		route(network, "patch", "/api/budgets/:id", (_, index) =>
			index === 0 ? conflict() : ok(budgetAnswer("food", { version: 6 })),
		);
		const { user, onSaved } = renderDialog("change", "food");
		await changeFromDecember(user);
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		await user.click(within(view()).getByRole("button", { name: "Keep mine" }));
		await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
		expect(onSaved.mock.calls[0]?.[1]).toMatchObject({
			text: "Food limit is now ₹7,000.00 from December 2026.",
			undo: {
				kind: "restore",
				version: 6,
				rules: {
					schedule: [
						{ from: "2026-09", limitMinor: 600000 },
						{ from: "2026-10", limitMinor: 500000 },
						{ from: "2026-11", limitMinor: 550000 },
					],
					overrides: [],
				},
			},
		});
	});

	test("another 409 shows the newer version, and the view stays", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", (_, index) =>
			index === 0 ?
				conflict(5)
			:	refuse(409, "version_conflict", {
					details: {
						current: budgetAnswer("food", {
							version: 6,
							schedule: [
								...FOOD.schedule,
								{ from: "2026-11", limitMinor: 550000 },
								{ from: "2027-01", limitMinor: 450000 },
							],
						}),
					},
				}),
		);
		const { user, onClose } = renderDialog("change", "food");
		await changeFromDecember(user);
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		expect(within(view()).queryByText(/Jan 2027/)).not.toBeInTheDocument();
		await user.click(within(view()).getByRole("button", { name: "Keep mine" }));
		expect(
			await within(view()).findByText("₹4,500.00 from Jan 2027"),
		).toBeVisible();
		expect(patches).toHaveLength(2);
		expect(onClose).not.toHaveBeenCalled();
		// Keep mine again goes against the newest version.
		await user.click(within(view()).getByRole("button", { name: "Keep mine" }));
		await waitFor(() => expect(patches).toHaveLength(3));
		expect(patches[2]?.headers.get("if-match")).toBe('"6"');
	});

	test("Keep theirs sends nothing, reads the saved Budget again and closes the dialog", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			conflict(),
		);
		const { user, onClose, queryClient } = renderDialog("change", "food");
		const invalidate = vi.spyOn(queryClient, "invalidateQueries");
		await changeFromDecember(user);
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		await user.click(
			within(view()).getByRole("button", { name: "Keep theirs" }),
		);
		expect(onClose).toHaveBeenCalledOnce();
		expect(patches).toHaveLength(1);
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["budgets"] });
		noView();
	});

	test("closing it without a choice goes back to the dialog with what was typed", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			conflict(),
		);
		const { user, onClose, onSaved } = renderDialog("change", "food");
		await changeFromDecember(user);
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		await user.keyboard("{Escape}");
		noView();
		expect(limitBox()).toHaveValue("7,000.00");
		expect(chip("Next month (December)")).toHaveAttribute(
			"aria-checked",
			"true",
		);
		expect(onClose).not.toHaveBeenCalled();
		expect(onSaved).not.toHaveBeenCalled();
		expect(patches).toHaveLength(1);
		// Saving again goes against the version the dialog was opened on.
		await user.click(button("Change from December"));
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		expect(patches).toHaveLength(2);
		expect(patches[1]?.headers.get("if-match")).toBe('"2"');
	});

	test("while Keep mine is sent, both choices wait", async () => {
		route(network, "patch", "/api/budgets/:id", async (_, index) => {
			if (index === 0) return conflict();
			await delay(100);
			return ok(budgetAnswer("food", { version: 6 }));
		});
		const { user, onClose } = renderDialog("change", "food");
		await changeFromDecember(user);
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		await user.click(within(view()).getByRole("button", { name: "Keep mine" }));
		expect(
			within(view()).getByRole("button", { name: "Keep theirs" }),
		).toHaveAttribute("aria-disabled", "true");
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	test.each([
		[
			"a 422 puts its messages in the dialog",
			() =>
				refuse(422, "validation_failed", {
					fields: { limitMinor: "The largest amount is 99,99,99,999.99." },
				}),
			"The largest amount is 99,99,99,999.99.",
		],
		[
			"a 404 says the Budget was deleted on another device",
			() => refuse(404, "not_found"),
			"This Budget was deleted on another device.",
		],
		[
			"no answer says the save failed",
			() => HttpResponse.error(),
			/^The Budget could not be saved/,
		],
	])("Keep mine meeting %s closes the view", async (_, answer, text) => {
		route(network, "patch", "/api/budgets/:id", (_, index) =>
			index === 0 ? conflict() : answer(),
		);
		const { user, onClose } = renderDialog("change", "food");
		await changeFromDecember(user);
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		await user.click(within(view()).getByRole("button", { name: "Keep mine" }));
		expect(await screen.findByText(text)).toBeVisible();
		noView();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a one-month limit's line says for … only", async () => {
		route(network, "patch", "/api/budgets/:id", () => conflict());
		const { user } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "8000");
		await user.click(chip(/^One month only/));
		await user.click(chip("October (viewing)"));
		await user.click(button("Change October only"));
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		expect(
			within(view()).getByText(
				"Keep mine applies your change, ₹8,000.00 for October 2026 only, to the saved Budget.",
			),
		).toBeVisible();
		expect(within(rowOf(/Oct 2026/)).getAllByRole("cell")[0]).toHaveTextContent(
			"₹8,000.00 in Oct 2026 only",
		);
	});

	test("a stop's line names the stop", async () => {
		route(network, "patch", "/api/budgets/:id", () =>
			refuse(409, "version_conflict", {
				details: { current: budgetAnswer("entertainment", { version: 4 }) },
			}),
		);
		const { user } = renderDialog("stop", "entertainment");
		await user.click(button("Stop from November"));
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		expect(
			within(view()).getByText(
				"Keep mine applies your change, the stop from November 2026, to the saved Budget.",
			),
		).toBeVisible();
		expect(within(rowOf(/Nov 2026/)).getAllByRole("cell")[0]).toHaveTextContent(
			"Stopped from Nov 2026",
		);
	});

	test("a stop for one month says no limit for … only", async () => {
		route(network, "patch", "/api/budgets/:id", () =>
			refuse(409, "version_conflict", {
				details: { current: budgetAnswer("entertainment", { version: 4 }) },
			}),
		);
		const { user } = renderDialog("stop", "entertainment");
		await user.click(chip(/^One month only/));
		await user.click(chip("October (viewing)"));
		await user.click(button("Stop October only"));
		await screen.findByRole("dialog", {
			name: "This Budget changed on another device",
		});
		expect(
			within(view()).getByText(
				"Keep mine applies your change, no limit for October 2026 only, to the saved Budget.",
			),
		).toBeVisible();
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

	// D-575, D-615: each press builds its own idempotency key, so a second press in the same
	// frame, before React shows the pending state, would be a second, distinct write.
	test("Enter twice in the same frame sends one change", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", async () => {
			await delay(60);
			return ok(budgetAnswer("food", { version: 3 }));
		});
		const { user, onClose } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		const form = screen.getByRole("form");
		act(() => {
			fireEvent.submit(form);
			fireEvent.submit(form);
		});
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(1);
	});

	test("the Save button pressed twice in the same frame sends one change", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", async () => {
			await delay(60);
			return ok(budgetAnswer("food", { version: 3 }));
		});
		const { user, onClose } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		const save = button("Change from November");
		act(() => {
			fireEvent.click(save);
			fireEvent.click(save);
		});
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(1);
	});

	test("Enter twice in the same frame sends one create", async () => {
		const posts = route(network, "post", "/api/budgets", async () => {
			await delay(60);
			return ok(
				budgetAnswer("food", {
					id: "0192f1a0-0000-7000-8000-0000000000aa",
					category: "health",
					schedule: [{ from: "2026-11", limitMinor: 150000 }],
				}),
				201,
			);
		});
		const { user, onClose } = renderDialog("add", null);
		await user.click(screen.getByText("Health"));
		await user.type(limitBox(), "1500");
		const form = screen.getByRole("form");
		act(() => {
			fireEvent.submit(form);
			fireEvent.submit(form);
		});
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(posts).toHaveLength(1);
	});

	test("a write that got no answer can be sent again with Enter", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", (_, index) =>
			index === 0 ?
				HttpResponse.error()
			:	ok(budgetAnswer("food", { version: 3 })),
		);
		const { user, onClose } = renderDialog("change", "food");
		await user.clear(limitBox());
		await user.type(limitBox(), "7000");
		// A press on Save moves focus off the box first, which formats it.
		act(() => limitBox().blur());
		const form = screen.getByRole("form");
		fireEvent.submit(form);
		await screen.findByText(/The Budget could not be saved/);
		fireEvent.submit(form);
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(2);
	});

	test("while it saves, Escape and the Close button do not close it", async () => {
		let answer: (value: Response) => void = () => {};
		route(
			network,
			"patch",
			"/api/budgets/:id",
			() => new Promise<Response>((resolve) => (answer = resolve)),
		);
		const { user, onClose } = renderDialog("change", "food");
		await changeFood(user);
		expect(button("Cancel")).toHaveAttribute("aria-disabled", "true");
		expect(button("Close")).toHaveAttribute("aria-disabled", "true");
		await user.keyboard("{Escape}");
		await user.click(button("Close"));
		expect(onClose).not.toHaveBeenCalled();
		expect(dialog()).toBeVisible();
		await act(async () => answer(ok(budgetAnswer("food", { version: 2 }))));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	test("a refusal after a press of Close mid-save still shows its line in the open dialog", async () => {
		let answer: (value: Response) => void = () => {};
		route(
			network,
			"patch",
			"/api/budgets/:id",
			() => new Promise<Response>((resolve) => (answer = resolve)),
		);
		const { user, onClose } = renderDialog("change", "food");
		await changeFood(user);
		await user.click(button("Close"));
		await act(async () => answer(refuse(404, "not_found")));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"This Budget was deleted on another device.",
		);
		expect(onClose).not.toHaveBeenCalled();
	});

	test("the Close button closes it when nothing is saving", async () => {
		const { user, onClose } = renderDialog("change", "food");
		await user.click(button("Close"));
		expect(onClose).toHaveBeenCalledOnce();
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

describe("What changes and its notes (BR-F04-26, BR-F04-27)", () => {
	const region = () => screen.queryByRole("region", { name: "What changes" });
	const cardsOf = () =>
		within(screen.getByRole("region", { name: "What changes" })).getAllByRole(
			"listitem",
		);
	/** Waits for the spending to come in, a state's words being split over two elements. */
	const stateShown = (text: string) =>
		waitFor(() =>
			expect(
				screen.getByRole("region", { name: "What changes" }),
			).toHaveTextContent(text),
		);
	async function typeLimit(
		user: ReturnType<typeof userEvent.setup>,
		text: string,
	) {
		await user.clear(limitBox());
		await user.type(limitBox(), text);
	}
	async function pickMonth(
		user: ReturnType<typeof userEvent.setup>,
		year: number,
		name: RegExp,
		yearsBack: number,
	) {
		await user.click(chip("Other month"));
		for (let each = 0; each < yearsBack; each++) {
			await user.click(screen.getByRole("button", { name: /Previous year/ }));
		}
		expect(screen.getByText(String(year))).toBeVisible();
		await user.click(screen.getByRole("option", { name }));
	}

	test("shows nothing until a category and a valid limit are set", async () => {
		const { user } = renderDialog("add", null, "2026-09");
		expect(region()).not.toBeInTheDocument();
		await user.click(screen.getByText("Health"));
		expect(region()).not.toBeInTheDocument();
		await user.type(limitBox(), "0");
		expect(region()).not.toBeInTheDocument();
		await user.clear(limitBox());
		await user.type(limitBox(), "1500");
		expect(region()).toBeVisible();
	});

	test("a Stop shows it with no limit typed", () => {
		renderDialog("stop", "entertainment");
		expect(region()).toBeVisible();
	});

	// Section 5, a retroactive change; flow 7.2.
	// AC-F04-31
	test("food at 7,000 from September: three cards, Dec 2026 onward, and the two notes", async () => {
		const { user } = renderDialog("change", "food");
		await typeLimit(user, "7000");
		await pickMonth(user, 2026, /September/, 0);
		await stateShown("84.2% Nearing limit → 72.1% · On track");
		const cards = cardsOf();
		expect(cards).toHaveLength(4);
		expect(cards[0]).toHaveTextContent("Sept 2026");
		expect(cards[0]).toHaveTextContent("Was ₹6,000.00");
		expect(cards[0]).toHaveTextContent("Now ₹7,000.00");
		expect(cards[1]).toHaveTextContent(
			"124.4% Over budget → 88.9% · Nearing limit",
		);
		expect(cards[2]).toHaveTextContent("6.0% · On track");
		expect(cards[3]).toHaveTextContent("Dec 2026 onward");
		expect(cards[3]).toHaveTextContent("₹7,000.00");
		expect(screen.getByText("3 months, then every month after")).toBeVisible();
		expect(
			screen.getByText("This also changes September and October 2026."),
		).toBeVisible();
		expect(
			screen.getByText(
				"This replaces the change to ₹5,000.00 from October 2026.",
			),
		).toBeVisible();
	});

	test("asks the history for the months it lists: September to the current month", async () => {
		const seen = route(network, "get", "/api/budgets/history", ({ path }) => {
			const query = new URL(path, "http://x").searchParams;
			return ok(
				historyAnswer(
					query.get("category") as ExpenseCategory,
					query.get("to") as Month,
					Number(query.get("months")),
				),
			);
		});
		const { user } = renderDialog("change", "food");
		await typeLimit(user, "7000");
		await pickMonth(user, 2026, /September/, 0);
		await stateShown("84.2% Nearing limit → 72.1% · On track");
		const queries = seen.map((each) =>
			Object.fromEntries(new URL(each.path, "http://x").searchParams),
		);
		expect(queries).toContainEqual({
			category: "food",
			to: "2026-11",
			months: "3",
		});
	});

	test("the cards follow the limit as it is typed", async () => {
		const { user } = renderDialog("change", "food");
		await typeLimit(user, "7000");
		await pickMonth(user, 2026, /September/, 0);
		expect(cardsOf()[0]).toHaveTextContent("Now ₹7,000.00");
		await typeLimit(user, "6500");
		expect(cardsOf()[0]).toHaveTextContent("Now ₹6,500.00");
		await stateShown("84.2% Nearing limit → 77.7% · On track");
	});

	// Section 5, a long change: 37 months, a strip and four groups.
	// AC-F04-31
	test("shopping at 4,000 from November 2023: a strip, the four groups and the three notes", async () => {
		const { user } = renderDialog("change", "shopping");
		await typeLimit(user, "4000");
		await pickMonth(user, 2023, /November/, 3);
		const table = await screen.findByRole("table", {
			name: "Months that change",
		});
		expect(screen.getByText("37 months, then every month after")).toBeVisible();
		expect(
			screen.getByText(
				"One column per month: spending against the new limit. Black tick: the old limit.",
			),
		).toBeVisible();
		const rows = within(within(table).getAllByRole("rowgroup")[1]!).getAllByRole(
			"row",
		);
		expect(rows).toHaveLength(5);
		expect(rows[0]).toHaveTextContent("Nov 2023 to Aug 202634 months");
		expect(rows[0]).toHaveTextContent("No Shopping spending · On track");
		expect(rows[1]).toHaveTextContent("80.0% Nearing limit → 60.0% · On track");
		expect(rows[2]).toHaveTextContent("100.0% At limit → 75.0% · On track");
		expect(rows[3]).toHaveTextContent("Nov 2026");
		expect(rows[3]).toHaveTextContent("No Shopping spending · On track");
		expect(rows[4]).toHaveTextContent("Dec 2026 onward");
		expect(
			screen.getByText("This also changes November 2023 to October 2026."),
		).toBeVisible();
		expect(
			screen.getByText("Shopping gets a Budget in 34 months that had none."),
		).toBeVisible();
		expect(
			screen.getByText(
				"This replaces the change to ₹3,000.00 from September 2026.",
			),
		).toBeVisible();
	});

	test("it asks the history for 37 months", async () => {
		const seen = route(network, "get", "/api/budgets/history", ({ path }) => {
			const query = new URL(path, "http://x").searchParams;
			return ok(
				historyAnswer(
					query.get("category") as ExpenseCategory,
					query.get("to") as Month,
					Number(query.get("months")),
				),
			);
		});
		const { user } = renderDialog("change", "shopping");
		await typeLimit(user, "4000");
		await pickMonth(user, 2023, /November/, 3);
		await screen.findByRole("table", { name: "Months that change" });
		expect(
			seen.map((each) =>
				Object.fromEntries(new URL(each.path, "http://x").searchParams),
			),
		).toContainEqual({ category: "shopping", to: "2026-11", months: "37" });
	});

	// Section 5, one-month limits.
	// AC-F04-31
	test("food at 8,000 for October only: the month before, the month, the month after, one note", async () => {
		const { user } = renderDialog("change", "food");
		await typeLimit(user, "8000");
		await user.click(chip(/^One month only/));
		await user.click(chip("October (viewing)"));
		await stateShown("124.4% Over budget → 77.8% · On track");
		const cards = cardsOf();
		expect(cards).toHaveLength(3);
		expect(cards[0]).toHaveTextContent("Unchanged");
		expect(cards[2]).toHaveTextContent("Back to the schedule");
		expect(screen.queryByText(/every month after/)).not.toBeInTheDocument();
		const only = screen.getByText(
			"Only October 2026 changes. The limits for other months stay as they are.",
		);
		expect(only).toBeVisible();
		// It is the only note.
		expect(only.closest("ul")?.children).toHaveLength(1);
	});

	test("one month only asks the history for September to November", async () => {
		const seen = route(network, "get", "/api/budgets/history", ({ path }) => {
			const query = new URL(path, "http://x").searchParams;
			return ok(
				historyAnswer(
					query.get("category") as ExpenseCategory,
					query.get("to") as Month,
					Number(query.get("months")),
				),
			);
		});
		const { user } = renderDialog("change", "food");
		await typeLimit(user, "8000");
		await user.click(chip(/^One month only/));
		await user.click(chip("October (viewing)"));
		await stateShown("124.4% Over budget → 77.8% · On track");
		expect(
			seen.map((each) =>
				Object.fromEntries(new URL(each.path, "http://x").searchParams),
			),
		).toContainEqual({ category: "food", to: "2026-11", months: "3" });
	});

	// Section 5, stopping.
	test("stopping entertainment from November: November and what comes after, one note", async () => {
		renderDialog("stop", "entertainment");
		const cards = cardsOf();
		expect(cards).toHaveLength(2);
		expect(cards[0]).toHaveTextContent("Nov 2026");
		expect(cards[0]).toHaveTextContent("Now No Budget");
		expect(cards[1]).toHaveTextContent("Dec 2026 onward");
		expect(screen.getByText("Earlier months keep their limits.")).toBeVisible();
		expect(screen.queryByText(/moves to Not budgeted/)).not.toBeInTheDocument();
	});

	// AC-F04-31
	test("stopping a month with spending says it moves to Not budgeted", async () => {
		const { user } = renderDialog("stop", "entertainment");
		await user.click(chip("October (viewing)"));
		expect(
			await screen.findByText(
				"Earlier months keep their limits. October's spending moves to Not budgeted.",
			),
		).toBeVisible();
		await stateShown("214.8% Over budget → Moves to Not budgeted");
	});

	test("a stop that would remove every month shows no preview and no notes", async () => {
		const { user } = renderDialog("stop", "food");
		await user.click(chip("Other month"));
		await user.click(screen.getByRole("option", { name: /September/ }));
		expect(region()).not.toBeInTheDocument();
		expect(screen.queryByText(/Earlier months keep/)).not.toBeInTheDocument();
	});

	// Section 5, equal to the schedule; BR-F04-27.
	// AC-F04-31
	test("a limit equal to the schedule says Nothing changes, with the preview and no notes", async () => {
		const { user } = renderDialog("change", "food", "2026-11");
		await user.click(chip(/^One month only/));
		await typeLimit(user, "5000");
		expect(
			screen.getByText(
				"Food already has this limit in November 2026. Nothing changes.",
			),
		).toBeVisible();
		expect(region()).toBeVisible();
		expect(
			screen.queryByText(/Only November 2026 changes/),
		).not.toBeInTheDocument();
		expect(button("Change November only")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});

	test("a new Budget from September has no old limits and no notes about gains", async () => {
		const { user } = renderDialog("add", null, "2026-09");
		await user.click(screen.getByText("Health"));
		await user.type(limitBox(), "1500");
		await pickMonth(user, 2026, /September/, 0);
		expect(
			await screen.findByText("This also changes September and October 2026."),
		).toBeVisible();
		expect(screen.queryByText(/gets a Budget/)).not.toBeInTheDocument();
	});

	test("while the spending loads, the limits show and the states follow", async () => {
		route(network, "get", "/api/budgets/history", async ({ path }) => {
			await delay(150);
			const query = new URL(path, "http://x").searchParams;
			return ok(
				historyAnswer(
					query.get("category") as ExpenseCategory,
					query.get("to") as Month,
					Number(query.get("months")),
				),
			);
		});
		const { user } = renderDialog("change", "food");
		await typeLimit(user, "7000");
		await pickMonth(user, 2026, /September/, 0);
		expect(cardsOf()[0]).toHaveTextContent("Now ₹7,000.00");
		expect(cardsOf()[0]).not.toHaveTextContent("On track");
		await stateShown("84.2% Nearing limit → 72.1% · On track");
	});

	// AC-F04-31
	test("when the history cannot be read, the limits show alone", async () => {
		route(network, "get", "/api/budgets/history", () => refuse(500, "internal"));
		const { user } = renderDialog("change", "food");
		await typeLimit(user, "7000");
		await pickMonth(user, 2026, /September/, 0);
		await waitFor(() =>
			expect(
				screen.getByText("This also changes September and October 2026."),
			).toBeVisible(),
		);
		expect(cardsOf()[0]).toHaveTextContent("Now ₹7,000.00");
		expect(screen.queryByText(/On track/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Nearing limit/)).not.toBeInTheDocument();
	});

	// Section 10
	// AC-F04-31
	test("offline, each month shows its old and new limit without spending or states", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { user } = renderDialog("change", "food");
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		await typeLimit(user, "7000");
		await pickMonth(user, 2026, /September/, 0);
		expect(cardsOf()[0]).toHaveTextContent("Was ₹6,000.00");
		expect(cardsOf()[0]).toHaveTextContent("Now ₹7,000.00");
		expect(screen.queryByText(/On track/)).not.toBeInTheDocument();
		expect(
			screen.getByText("This also changes September and October 2026."),
		).toBeVisible();
	});

	// Section 10: the history is not kept offline, even one read earlier in the session.
	// AC-F04-31
	test("going offline after the spending was read takes the states and the hint away, and online brings them back", async () => {
		const { user } = renderDialog("change", "food");
		await typeLimit(user, "7000");
		await pickMonth(user, 2026, /September/, 0);
		await stateShown("84.2% Nearing limit → 72.1% · On track");
		await hint();

		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		await waitFor(() =>
			expect(screen.queryByText(/On track/)).not.toBeInTheDocument(),
		);
		expect(screen.queryByText(/^Spent /)).not.toBeInTheDocument();
		expect(cardsOf()[0]).toHaveTextContent("Was ₹6,000.00");
		expect(cardsOf()[0]).toHaveTextContent("Now ₹7,000.00");

		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await stateShown("84.2% Nearing limit → 72.1% · On track");
	});

	test("a category's Budget record decides the gains note: a stopped Budget that restarts", async () => {
		const { user } = renderDialog("change", "transportation", "2026-10");
		await typeLimit(user, "2500");
		await pickMonth(user, 2026, /August/, 0);
		expect(
			await screen.findByText(
				"Transportation gets a Budget in 2 months that had none.",
			),
		).toBeVisible();
	});
});
