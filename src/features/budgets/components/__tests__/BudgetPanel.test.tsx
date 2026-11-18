import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { ok, route } from "../../hooks/__tests__/helpers";
import {
	historyAnswer,
	monthAnswer,
	payeeSummary,
} from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import { BudgetPanel, type BudgetPanelProps } from "../BudgetPanel";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
	route(network, "get", "/api/budgets/history", ({ path }) => {
		const query = new URL(path, "http://x").searchParams;
		return ok(
			historyAnswer(
				query.get("category") as ExpenseCategory,
				query.get("to") as Month,
			),
		);
	});
	route(network, "get", "/api/transactions/summary", () => ok(payeeSummary()));
});
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

function renderPanel(props: Partial<BudgetPanelProps> = {}) {
	const handlers = {
		onClose: vi.fn(),
		onAdd: vi.fn(),
		onChangeLimit: vi.fn(),
		onStop: vi.fn(),
		onDelete: vi.fn(),
		onRemoveMonthLimit: vi.fn(),
	};
	const view = renderInApp(
		<BudgetPanel
			isDocked
			month={props.view?.month ?? "2026-10"}
			view={monthAnswer("2026-10")}
			selected={null}
			formats={IN}
			{...handlers}
			{...props}
		/>,
	);
	return { ...view, ...handlers, user: userEvent.setup() };
}

const aside = () => screen.getByRole("complementary", { name: "Budget details" });

describe("BudgetPanel docked (BR-F04-30)", () => {
	test("a sticky column, hidden below 1180 px until the browser knows the width", () => {
		renderPanel({ className: "mt-2" });
		expect(aside()).toHaveClass("sticky", "max-dock:hidden", "mt-2");
	});

	test("with nothing selected, the month's summary", () => {
		renderPanel();
		expect(
			screen.getByRole("region", { name: "Compared with September" }),
		).toBeVisible();
	});

	test("with a category selected, its details", async () => {
		renderPanel({ selected: "food" });
		expect(
			screen.getByRole("heading", { level: 2, name: "Budget" }),
		).toBeVisible();
		expect(
			screen.queryByRole("region", { name: "Compared with September" }),
		).not.toBeInTheDocument();
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("a selection the month does not show falls back to the summary", () => {
		renderPanel({ view: monthAnswer("2026-08"), selected: "housing" });
		expect(
			screen.getByRole("region", { name: "Compared with July" }),
		).toBeVisible();
	});

	test("while the month loads, the summary's shape", () => {
		renderPanel({ view: undefined });
		expect(
			screen.getByRole("heading", { level: 2, name: "October 2026" }),
		).toBeVisible();
		expect(
			screen.getByRole("region", { name: "Compared with September" }),
		).toBeVisible();
		expect(
			screen.getByText("This month").parentElement?.parentElement,
		).toHaveAttribute("aria-busy", "true");
	});

	test("while the month loads with a selection, the selection's shape", async () => {
		renderPanel({ view: undefined, selected: "food" });
		expect(screen.getByText("Food")).toBeVisible();
		expect(screen.getByRole("button", { name: "Close details" })).toBeVisible();
		expect(screen.queryByText("This month")).not.toBeInTheDocument();
		await screen.findByRole("img", { name: /^Spent by month/ });
	});

	test("its buttons answer with the selected category", async () => {
		const { user, onClose, onChangeLimit, onStop, onDelete } = renderPanel({
			selected: "food",
		});
		await user.click(screen.getByRole("button", { name: "Change limit" }));
		await user.click(screen.getByRole("button", { name: "Stop" }));
		await user.click(screen.getByRole("button", { name: "Delete" }));
		await user.click(screen.getByRole("button", { name: "Close details" }));
		expect(onChangeLimit).toHaveBeenCalledExactlyOnceWith("food");
		expect(onStop).toHaveBeenCalledExactlyOnceWith("food");
		expect(onDelete).toHaveBeenCalledExactlyOnceWith("food");
		expect(onClose).toHaveBeenCalledOnce();
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("Add a Budget answers with the category", async () => {
		const { user, onAdd } = renderPanel({
			view: monthAnswer("2026-09"),
			selected: "health",
		});
		await user.click(screen.getByRole("button", { name: "Add a Budget" }));
		expect(onAdd).toHaveBeenCalledExactlyOnceWith("health");
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("Remove answers with the category and the month", async () => {
		const view = monthAnswer("2026-10");
		const { user, onRemoveMonthLimit } = renderPanel({
			view: {
				...view,
				budgets: view.budgets.map((row) =>
					row.category === "food" ?
						{
							...row,
							overrides: [{ month: "2026-12", limitMinor: 700000 }],
						}
					:	row,
				),
			},
			selected: "food",
		});
		await user.click(
			screen.getByRole("button", {
				name: "Remove ₹7,000.00 in Dec 2026 only",
			}),
		);
		expect(onRemoveMonthLimit).toHaveBeenCalledExactlyOnceWith(
			"food",
			"2026-12",
		);
		await screen.findByRole("region", { name: "Last 6 months" });
	});
});

describe("BudgetPanel as a drawer, below 1180 px (BR-F04-30)", () => {
	test("with nothing selected nothing shows", () => {
		renderPanel({ isDocked: false });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
	});

	test("a selection opens it with the details and the drawer's hint", async () => {
		renderPanel({ isDocked: false, selected: "food" });
		const drawer = await screen.findByRole("dialog", { name: "Budget details" });
		expect(drawer).toBeVisible();
		expect(drawer).toHaveTextContent(
			"L to change limit · S to stop · Delete to delete · Esc to close",
		);
		await screen.findByRole("region", { name: "Last 6 months" });
	});

	test("while the month loads, a selection keeps it open with the selection's shape", async () => {
		renderPanel({ isDocked: false, view: undefined, selected: "food" });
		const drawer = await screen.findByRole("dialog", { name: "Budget details" });
		expect(within(drawer).getByText("Food")).toBeVisible();
		await within(drawer).findByRole("img", { name: /^Spent by month/ });
	});

	test("a selection the loaded month does not show keeps it closed", () => {
		renderPanel({
			isDocked: false,
			view: monthAnswer("2026-08"),
			selected: "housing",
		});
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	test("Escape closes it", async () => {
		const { user, onClose } = renderPanel({ isDocked: false, selected: "food" });
		await screen.findByRole("region", { name: "Last 6 months" });
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("Close details closes it", async () => {
		const { user, onClose } = renderPanel({ isDocked: false, selected: "food" });
		await user.click(
			await screen.findByRole("button", { name: "Close details" }),
		);
		expect(onClose).toHaveBeenCalled();
		await waitFor(() =>
			expect(
				screen.getByRole("region", { name: "Last 6 months" }),
			).toBeVisible(),
		);
	});
});
