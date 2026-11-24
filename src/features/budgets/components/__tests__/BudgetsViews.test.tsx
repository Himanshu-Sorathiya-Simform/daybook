import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { BudgetMonthAnswer } from "../../lib/types";
import type { Formats } from "../../lib/labels";
import { monthAnswer } from "../../lib/__tests__/fixtures";
import { BudgetsViews, type BudgetsViewsProps } from "../BudgetsViews";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

const OCTOBER = monthAnswer("2026-10");
const NOT_BUDGETED_ONLY: BudgetMonthAnswer = {
	...OCTOBER,
	budgets: [],
	inactive: [],
};
const NOTHING: BudgetMonthAnswer = {
	...OCTOBER,
	budgets: [],
	unbudgeted: [],
	inactive: [],
};

function setup(props: Partial<BudgetsViewsProps> = {}) {
	return render(
		<BudgetsViews
			view="list"
			wide
			shown={OCTOBER}
			formats={IN}
			filter={null}
			onFilterChange={vi.fn()}
			selected={null}
			onSelect={vi.fn()}
			arrows="select"
			sorting={[]}
			onSortingChange={vi.fn()}
			todayShare={null}
			onAdd={vi.fn()}
			onChangeLimit={vi.fn()}
			onDelete={vi.fn()}
			{...props}
		/>,
	);
}

const list = () => screen.queryByRole("grid", { name: "Budgets" });
const table = () => screen.queryByRole("grid", { name: /Select a column heading/ });

describe("the month's view (BR-F04-14, BR-F04-18, D-570)", () => {
	test("the list is the default", () => {
		setup();
		expect(list()).toBeVisible();
		expect(table()).toBeNull();
	});

	test("the remembered table shows from 768 px, for a month with a Budget", () => {
		setup({ view: "table", wide: true });
		expect(table()).toBeVisible();
		expect(list()).toBeNull();
	});

	test("below 768 px a remembered table shows the list", () => {
		setup({ view: "table", wide: false });
		expect(list()).toBeVisible();
		expect(table()).toBeNull();
	});

	test("a month with no Budget shows the list even when the table is remembered", () => {
		setup({ view: "table", wide: true, shown: NOT_BUDGETED_ONLY });
		expect(list()).toBeVisible();
		expect(table()).toBeNull();
	});

	test("a month with no row at all shows neither", () => {
		const view = setup({ shown: NOTHING });
		expect(list()).toBeNull();
		expect(table()).toBeNull();
		expect(view.container).toBeEmptyDOMElement();
	});
});
