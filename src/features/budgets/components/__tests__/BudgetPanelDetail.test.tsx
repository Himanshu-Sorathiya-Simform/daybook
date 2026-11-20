import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { offline, ok, refuse, route } from "../../hooks/__tests__/helpers";
import {
	historyAnswer,
	monthAnswer,
	payeeSummary,
} from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import { subjectOf } from "../../lib/panel";
import { BudgetPanelDetail } from "../BudgetPanelDetail";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

/** Serves golden's history and the payee summary, unless told otherwise. */
function serve({
	history = (category: ExpenseCategory, to: Month) =>
		ok(historyAnswer(category, to)),
	payees = () => ok(payeeSummary()),
}: {
	history?: (category: ExpenseCategory, to: Month) => Response | Promise<Response>;
	payees?: () => Response | Promise<Response>;
} = {}) {
	const histories = route(network, "get", "/api/budgets/history", ({ path }) => {
		const query = new URL(path, "http://x").searchParams;
		return history(
			query.get("category") as ExpenseCategory,
			query.get("to") as Month,
		);
	});
	const summaries = route(network, "get", "/api/transactions/summary", payees);
	return { histories, summaries };
}

function renderDetail(
	category: ExpenseCategory,
	month: Month,
	{
		isDocked = true,
		loading = false,
	}: {
		isDocked?: boolean;
		/** As while the month loads: no subject yet. */
		loading?: boolean;
	} = {},
) {
	const subject = loading ? null : subjectOf(monthAnswer(month), category);
	if (!loading && !subject) throw new Error(`${month} shows no ${category}.`);
	const handlers = {
		onClose: vi.fn(),
		onAdd: vi.fn(),
		onChangeLimit: vi.fn(),
		onStop: vi.fn(),
		onDelete: vi.fn(),
		onRemoveMonthLimit: vi.fn(),
	};
	const view = renderInApp(
		<BudgetPanelDetail
			category={category}
			subject={subject}
			month={month}
			formats={IN}
			isDocked={isDocked}
			{...handlers}
		/>,
	);
	return { ...view, ...handlers, user: userEvent.setup() };
}

const actionNames = () =>
	screen
		.getAllByRole("button")
		.map((each) => each.textContent)
		.filter((name) => name !== "" && !/^View as|^Remove/.test(name ?? ""));

describe("BudgetPanelDetail: a Budget (BR-F04-30)", () => {
	test("the header row stays pinned at the panel's top edge while the rest scrolls (D-621)", async () => {
		serve();
		renderDetail("food", "2026-10");
		const header = screen.getByRole("heading", {
			level: 2,
			name: "Budget",
		}).parentElement;
		expect(header).toHaveClass(
			"sticky",
			"-top-5",
			"-mt-5",
			"pt-5",
			"z-10",
			"bg-section",
		);
	});

	test("the label Budget, Close details, and the category", async () => {
		serve();
		const { user, onClose } = renderDetail("food", "2026-10");
		expect(
			screen.getByRole("heading", { level: 2, name: "Budget" }),
		).toBeVisible();
		expect(screen.getByText("Food")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Close details" }));
		expect(onClose).toHaveBeenCalledOnce();
	});

	// F04 section 5: October food
	test("golden October food: the spent of its limit, its use and state, and its source", async () => {
		serve();
		renderDetail("food", "2026-10");
		expect(screen.getByText("₹6,220.00")).toBeVisible();
		expect(screen.getByText("of ₹5,000.00")).toBeVisible();
		const state = screen.getByText("Over by ₹1,220.00 · Over budget");
		expect(state).toHaveClass("text-neg", "font-semibold");
		expect(state.parentElement).toHaveTextContent(
			"124.4% · Over by ₹1,220.00 · Over budget",
		);
		expect(
			screen.getByText("₹5,000.00 from Oct 2026", { selector: "p" }),
		).toBeVisible();
		await screen.findByRole("region", { name: "Where it went in October" });
	});

	test("golden September food: its source names the next entry", async () => {
		serve();
		renderDetail("food", "2026-09");
		expect(
			screen.getByText(
				"₹6,000.00 from Sept 2026, then ₹5,000.00 from Oct 2026",
			),
		).toBeVisible();
		expect(screen.queryByText(/Over by/)).not.toBeInTheDocument();
		expect(screen.getByText("₹950.00 left · Nearing limit")).toHaveClass(
			"text-warn",
		);
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("an On track Budget reads in plain ink: September entertainment", async () => {
		serve();
		renderDetail("entertainment", "2026-09");
		expect(screen.getByText("₹351.00 left · On track")).toHaveClass("text-ink");
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("Last 6 months ending at the month, and the limit history", async () => {
		const { histories } = serve();
		renderDetail("food", "2026-10");
		expect(
			await screen.findByRole("img", { name: /^Spent by month: May 2026/ }),
		).toBeVisible();
		expect(histories.map((each) => each.path)).toEqual([
			"/api/budgets/history?category=food&to=2026-10&months=6",
		]);
		expect(
			within(
				screen.getByRole("region", { name: "Limit history" }),
			).getAllByRole("listitem"),
		).toHaveLength(3);
	});

	test("Where it went: the top 3 payees and See 4 Transactions", async () => {
		const { summaries } = serve();
		renderDetail("food", "2026-10");
		const where = screen.getByRole("region", {
			name: "Where it went in October",
		});
		expect(await within(where).findByRole("link")).toHaveAccessibleName(
			"See 4 Transactions",
		);
		expect(within(where).getAllByRole("listitem")).toHaveLength(3);
		expect(summaries).toHaveLength(1);
		expect(summaries[0]?.path).toContain("cat=food");
	});

	test("Change limit, Stop and Delete, with their keys in the docked hint", async () => {
		serve();
		const { user, onChangeLimit, onStop, onDelete } = renderDetail(
			"food",
			"2026-10",
		);
		expect(actionNames()).toEqual(["Change limit", "Stop", "Delete"]);
		await user.click(screen.getByRole("button", { name: "Change limit" }));
		await user.click(screen.getByRole("button", { name: "Stop" }));
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(onChangeLimit).toHaveBeenCalledOnce();
		expect(onStop).toHaveBeenCalledOnce();
		expect(onDelete).toHaveBeenCalledOnce();
		expect(
			screen.getByText(
				"L to change limit · S to stop · Delete to delete · Up and down arrows move · Esc to close",
			),
		).toBeVisible();
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	// D-571
	test("in the drawer the hint leaves out the arrows", async () => {
		serve();
		renderDetail("food", "2026-10", { isDocked: false });
		expect(
			screen.getByText(
				"L to change limit · S to stop · Delete to delete · Esc to close",
			),
		).toBeVisible();
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("Remove in the limit history sends the month", async () => {
		serve();
		const view = monthAnswer("2026-10");
		const food = view.budgets.find((row) => row.category === "food");
		const subject = subjectOf(
			{
				...view,
				budgets: [
					{
						...(food as NonNullable<typeof food>),
						overrides: [{ month: "2026-12", limitMinor: 700000 }],
					},
				],
			},
			"food",
		);
		const onRemoveMonthLimit = vi.fn();
		renderInApp(
			<BudgetPanelDetail
				category="food"
				subject={subject as NonNullable<typeof subject>}
				month="2026-10"
				formats={IN}
				isDocked
				onClose={vi.fn()}
				onAdd={vi.fn()}
				onChangeLimit={vi.fn()}
				onStop={vi.fn()}
				onDelete={vi.fn()}
				onRemoveMonthLimit={onRemoveMonthLimit}
			/>,
		);
		await userEvent.click(
			screen.getByRole("button", {
				name: "Remove ₹7,000.00 in Dec 2026 only",
			}),
		);
		expect(onRemoveMonthLimit).toHaveBeenCalledExactlyOnceWith("2026-12");
	});
});

describe("BudgetPanelDetail: Not budgeted and Not active (BR-F04-30)", () => {
	test("September health, with no Budget record: the spent with no limit, no limit history, Add a Budget", async () => {
		serve();
		const { user, onAdd } = renderDetail("health", "2026-09");
		expect(
			screen.getByRole("heading", { level: 2, name: "Not budgeted" }),
		).toBeVisible();
		expect(
			screen.getByText("₹1,500.00 spent in September, no limit"),
		).toBeVisible();
		expect(
			screen.queryByRole("region", { name: "Limit history" }),
		).not.toBeInTheDocument();
		expect(actionNames()).toEqual(["Add a Budget"]);
		await user.click(screen.getByRole("button", { name: "Add a Budget" }));
		expect(onAdd).toHaveBeenCalledOnce();
		expect(
			screen.getByText("Up and down arrows move · Esc to close"),
		).toBeVisible();
		expect(
			await screen.findByRole("img", {
				name: /Sept 2026 ₹1,500.00, no limit/,
			}),
		).toBeVisible();
	});

	// F04 section 5: transportation is in both groups in September
	test("September transportation, Not budgeted with a record: its limit history and Change limit", async () => {
		serve();
		const { user, onChangeLimit } = renderDetail("transportation", "2026-09");
		expect(
			screen.getByRole("heading", { level: 2, name: "Not budgeted" }),
		).toBeVisible();
		expect(
			screen.getByText("₹450.00 spent in September, no limit"),
		).toBeVisible();
		expect(
			within(screen.getByRole("region", { name: "Limit history" }))
				.getAllByRole("listitem")
				.map((each) => each.textContent),
		).toEqual(["₹2,000.00 from Oct 2026", "No Budget before Oct 2026"]);
		expect(actionNames()).toEqual(["Change limit"]);
		await user.click(screen.getByRole("button", { name: "Change limit" }));
		expect(onChangeLimit).toHaveBeenCalledOnce();
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("August transportation, Not active: its caption, Change limit and Delete", async () => {
		serve({ payees: () => ok(payeeSummary({ count: 0, byPayee: [] })) });
		const { user, onDelete } = renderDetail("transportation", "2026-08");
		expect(
			screen.getByRole("heading", { level: 2, name: "Not active this month" }),
		).toBeVisible();
		expect(screen.getByText("Starts October 2026")).toBeVisible();
		expect(actionNames()).toEqual(["Change limit", "Delete"]);
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(onDelete).toHaveBeenCalledOnce();
		expect(
			screen.getByText(
				"L to change limit · Delete to delete · Up and down arrows move · Esc to close",
			),
		).toBeVisible();
		await screen.findByRole("region", { name: "Last 6 months" });
		// With no spending in the month, Where it went is left out.
		expect(
			screen.queryByRole("region", { name: /^Where it went/ }),
		).not.toBeInTheDocument();
	});
});

describe("BudgetPanelDetail: its reads (D-571)", () => {
	test("while they load, each section shows its heading over skeletons and is busy", async () => {
		const slow = async (respond: () => Response) => {
			await delay(50);
			return respond();
		};
		serve({
			history: (category, to) => slow(() => ok(historyAnswer(category, to))),
			payees: () => slow(() => ok(payeeSummary())),
		});
		renderDetail("food", "2026-10");
		const six = screen.getByRole("region", { name: "Last 6 months" });
		expect(six).toHaveAttribute("aria-busy", "true");
		expect(six.querySelectorAll('[data-part="skeleton-bar"]')).toHaveLength(6);
		// Food has a limit in those months, so the caption holds its place.
		expect(within(six).getByText(/^Dashed line/)).toBeVisible();
		const where = screen.getByRole("region", {
			name: "Where it went in October",
		});
		expect(where).toHaveAttribute("aria-busy", "true");
		expect(within(where).queryByRole("link")).not.toBeInTheDocument();
		await within(where).findByRole("link", { name: "See 4 Transactions" });
		expect(where).toHaveAttribute("aria-busy", "false");
		await waitFor(() => expect(six).toHaveAttribute("aria-busy", "false"));
		expect(within(six).getByRole("img")).toBeVisible();
	});

	test("a category with no limit in those months holds no caption: September health", () => {
		serve({
			history: () => new Promise(() => {}),
			payees: () => new Promise(() => {}),
		});
		renderDetail("health", "2026-09");
		const six = screen.getByRole("region", { name: "Last 6 months" });
		expect(six).toHaveAttribute("aria-busy", "true");
		expect(within(six).queryByText(/^Dashed line/)).not.toBeInTheDocument();
	});

	test("with no spending in the month, Where it went holds no place: August transportation", () => {
		serve({
			history: () => new Promise(() => {}),
			payees: () => new Promise(() => {}),
		});
		renderDetail("transportation", "2026-08");
		expect(
			screen.queryByRole("region", { name: /^Where it went/ }),
		).not.toBeInTheDocument();
	});

	test("a Budget with nothing spent yet holds no place for Where it went: December food", () => {
		serve({
			history: () => new Promise(() => {}),
			payees: () => new Promise(() => {}),
		});
		renderDetail("food", "2026-12");
		expect(
			screen.queryByRole("region", { name: /^Where it went/ }),
		).not.toBeInTheDocument();
	});

	test("a record with no limit in those months holds no caption: September transportation, from October", () => {
		serve({
			history: () => new Promise(() => {}),
			payees: () => new Promise(() => {}),
		});
		renderDetail("transportation", "2026-09");
		const six = screen.getByRole("region", { name: "Last 6 months" });
		expect(six).toHaveAttribute("aria-busy", "true");
		expect(within(six).queryByText(/^Dashed line/)).not.toBeInTheDocument();
	});

	test("while the month loads: the category, Close details and the two sections, with skeleton lines for the rest", async () => {
		serve({ payees: () => new Promise(() => {}) });
		const { user, onClose, container } = renderDetail("food", "2026-10", {
			loading: true,
		});
		expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
		expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
		expect(screen.getByText("Food")).toBeVisible();
		expect(
			screen.queryByRole("region", { name: "Limit history" }),
		).not.toBeInTheDocument();
		// Unknown before the month: whether the category has spending, and any record.
		expect(
			screen.getByRole("region", { name: "Where it went in October" }),
		).toHaveAttribute("aria-busy", "true");
		expect(
			within(
				screen.getByRole("region", { name: "Last 6 months" }),
			).queryByText(/^Dashed line/),
		).not.toBeInTheDocument();
		expect(actionNames()).toEqual([]);
		expect(screen.queryByText(/Esc to close/)).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Close details" }));
		expect(onClose).toHaveBeenCalledOnce();
		expect(
			await screen.findByRole("img", { name: /^Spent by month: May 2026/ }),
		).toBeVisible();
	});

	test("a failed read leaves its section out", async () => {
		const { histories, summaries } = serve({
			history: () => refuse(500, "internal"),
			payees: () => refuse(500, "internal"),
		});
		renderDetail("food", "2026-10");
		await vi.waitFor(() => {
			expect(histories.length).toBeGreaterThan(0);
			expect(summaries.length).toBeGreaterThan(0);
			expect(
				screen.queryByRole("region", { name: "Last 6 months" }),
			).not.toBeInTheDocument();
			expect(
				screen.queryByRole("region", { name: /^Where it went/ }),
			).not.toBeInTheDocument();
		});
		// The rest of the panel still shows.
		expect(screen.getByRole("region", { name: "Limit history" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Change limit" })).toBeVisible();
	});

	test("offline, with nothing read yet, the sections are left out without a skeleton", () => {
		const online = offline();
		try {
			const { histories, summaries } = serve();
			renderDetail("food", "2026-10");
			expect(screen.queryByRole("status")).not.toBeInTheDocument();
			expect(
				screen.queryByRole("region", { name: "Last 6 months" }),
			).not.toBeInTheDocument();
			expect(histories).toHaveLength(0);
			expect(summaries).toHaveLength(0);
		} finally {
			online();
		}
	});

	// Section 10: the history is not kept offline, even one read earlier in the session.
	test("going offline after Last 6 months was read takes it away, and online brings it back", async () => {
		serve();
		renderDetail("food", "2026-10");
		await screen.findByRole("region", { name: "Last 6 months" });

		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		await waitFor(() =>
			expect(
				screen.queryByRole("region", { name: "Last 6 months" }),
			).not.toBeInTheDocument(),
		);
		expect(screen.getByRole("region", { name: "Limit history" })).toBeVisible();

		online.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(
			await screen.findByRole("region", { name: "Last 6 months" }),
		).toBeVisible();
	});

	test("takes the caller's classes", async () => {
		serve();
		const subject = subjectOf(monthAnswer("2026-10"), "food");
		const { container } = renderInApp(
			<BudgetPanelDetail
				category="food"
				subject={subject as NonNullable<typeof subject>}
				month="2026-10"
				formats={IN}
				isDocked
				onClose={vi.fn()}
				onAdd={vi.fn()}
				onChangeLimit={vi.fn()}
				onStop={vi.fn()}
				onDelete={vi.fn()}
				onRemoveMonthLimit={vi.fn()}
				className="mt-2"
			/>,
		);
		expect(container.querySelector(".mt-2")).toHaveClass("flex", "min-h-full");
		await screen.findByRole("region", { name: "Last 6 months" });
	});
});
