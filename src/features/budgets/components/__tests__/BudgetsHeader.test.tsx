import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { BudgetsHeader, type BudgetsHeaderProps } from "../BudgetsHeader";

function renderHeader(props: Partial<BudgetsHeaderProps> = {}) {
	const handlers = {
		onMonthChange: vi.fn(),
		onViewChange: vi.fn(),
		onAdd: vi.fn(),
	};
	const view = renderInApp(
		<BudgetsHeader
			month="2026-10"
			current="2026-11"
			dateLocale="en-IN"
			numberLocale="hi-IN-u-nu-latn"
			asOf={null}
			view="list"
			{...handlers}
			{...props}
		/>,
	);
	return { ...view, ...handlers, user: userEvent.setup() };
}

describe("BudgetsHeader (BR-F04-14)", () => {
	test("in order: the title, the month control, List or Table, then Add a Budget", () => {
		renderHeader();
		const order = [
			screen.getByRole("heading", { level: 1, name: "Budgets" }),
			screen.getByRole("button", { name: "Previous month" }),
			screen.getByRole("radiogroup", { name: "Show Budgets as" }),
			...screen.getAllByRole("button", { name: "Add a Budget" }),
		];
		for (let i = 1; i < order.length; i++) {
			expect(
				(order[i - 1] as HTMLElement).compareDocumentPosition(
					order[i] as HTMLElement,
				) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		}
	});

	test('shows "as of" beside the title when given', () => {
		renderHeader({ asOf: "as of 2:05 pm" });
		expect(screen.getByText("as of 2:05 pm")).toBeVisible();
	});

	test('shows no "as of" without one', () => {
		renderHeader();
		expect(screen.queryByText(/^as of/)).not.toBeInTheDocument();
	});

	test("the arrows ask for the month before and after", async () => {
		const { user, onMonthChange } = renderHeader();
		await user.click(screen.getByRole("button", { name: "Previous month" }));
		await user.click(screen.getByRole("button", { name: "Next month" }));
		expect(onMonthChange.mock.calls).toEqual([["2026-09"], ["2026-11"]]);
	});

	test("the arrows work across a year's end", async () => {
		const { user, onMonthChange } = renderHeader({ month: "2027-01" });
		await user.click(screen.getByRole("button", { name: "Previous month" }));
		expect(onMonthChange).toHaveBeenCalledWith("2026-12");
	});

	test("a month in another locale is named in it", () => {
		renderHeader({ dateLocale: "de-DE" });
		expect(screen.getByRole("button", { name: "Oktober 2026" })).toBeVisible();
	});

	test("List or Table reports the choice", async () => {
		const { user, onViewChange } = renderHeader();
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(onViewChange).toHaveBeenCalledWith("table");
	});

	test("choosing List from Table reports List", async () => {
		const { user, onViewChange } = renderHeader({ view: "table" });
		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(onViewChange).toHaveBeenCalledWith("list");
	});

	test("shows the view it is given", () => {
		renderHeader({ view: "table" });
		expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
	});
});
