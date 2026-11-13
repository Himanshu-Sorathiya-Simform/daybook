import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Formats } from "../../lib/labels";
import { BudgetsFilter, type BudgetsFilterProps } from "../BudgetsFilter";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

function renderFilter(props: Partial<BudgetsFilterProps> = {}) {
	const onFilterChange = vi.fn();
	const view = render(
		<BudgetsFilter
			filter="over"
			isEmpty={false}
			month="2026-10"
			formats={IN}
			onFilterChange={onFilterChange}
			{...props}
		/>,
	);
	return { ...view, onFilterChange, user: userEvent.setup() };
}

describe("BudgetsFilter (BR-F04-31)", () => {
	test("reads Showing with the state's chip and Show all", () => {
		renderFilter();
		expect(screen.getByText("Showing")).toBeVisible();
		expect(screen.getByRole("row", { name: "Over budget" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Show all" })).toBeVisible();
	});

	test.each([
		["at", "At limit"],
		["warning", "Nearing limit"],
		["ok", "On track"],
	] as const)("the chip names %s as %s", (filter, label) => {
		renderFilter({ filter });
		expect(screen.getByRole("row", { name: label })).toBeVisible();
	});

	test("the chip's remove button clears the filter", async () => {
		const { user, onFilterChange } = renderFilter();
		await user.click(screen.getByRole("button", { name: /Remove/ }));
		expect(onFilterChange).toHaveBeenCalledExactlyOnceWith(null);
	});

	test("Show all clears the filter", async () => {
		const { user, onFilterChange } = renderFilter();
		await user.click(screen.getByRole("button", { name: "Show all" }));
		expect(onFilterChange).toHaveBeenCalledExactlyOnceWith(null);
	});

	test("with rows, no empty text", () => {
		renderFilter();
		expect(screen.queryByText(/^No Budgets/)).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Show all Budgets" }),
		).not.toBeInTheDocument();
	});

	test("with no rows, the empty text for the state and month, and Show all Budgets clears it", async () => {
		const { user, onFilterChange } = renderFilter({
			filter: "warning",
			isEmpty: true,
			month: "2026-09",
		});
		expect(
			screen.getByText(
				"No Budgets are nearing their limit in September 2026.",
			),
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Show all Budgets" }));
		expect(onFilterChange).toHaveBeenCalledExactlyOnceWith(null);
	});

	test("takes the caller's classes", () => {
		const { container } = renderFilter({ className: "mb-2" });
		expect(container.firstElementChild).toHaveClass("flex", "flex-col", "mb-2");
	});
});
