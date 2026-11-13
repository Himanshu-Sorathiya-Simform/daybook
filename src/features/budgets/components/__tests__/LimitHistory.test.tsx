import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { Formats } from "../../lib/labels";
import { LimitHistory, type LimitHistoryProps } from "../LimitHistory";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

/** Golden food with 8,000.00 for October only. */
const FOOD_RAISED = {
	...goldenBudget("food"),
	overrides: [{ month: "2026-10", limitMinor: 800000 }],
};

function renderHistory(props: Partial<LimitHistoryProps> = {}) {
	const onRemove = vi.fn();
	const view = render(
		<LimitHistory
			rules={goldenBudget("food")}
			month="2026-10"
			formats={IN}
			onRemove={onRemove}
			{...props}
		/>,
	);
	return { ...view, onRemove, user: userEvent.setup() };
}

const items = () =>
	within(screen.getByRole("list"))
		.getAllByRole("listitem")
		.map((each) => each.textContent);

describe("LimitHistory (BR-F04-30)", () => {
	test("is a section named Limit history", () => {
		renderHistory();
		expect(screen.getByRole("region", { name: "Limit history" })).toBeVisible();
	});

	test("golden food in October: newest first, the item in force, then No Budget before", () => {
		renderHistory();
		expect(items()).toEqual([
			"₹5,000.00 from Oct 2026In force in October",
			"₹6,000.00 from Sept 2026",
			"No Budget before Sept 2026",
		]);
	});

	test("the item in force is bold; the others are not", () => {
		renderHistory();
		const [now, before, end] = within(screen.getByRole("list")).getAllByRole(
			"listitem",
		);
		expect(now).toHaveClass("font-semibold", "text-ink");
		expect(before).toHaveClass("text-ink-2");
		expect(before).not.toHaveClass("font-semibold");
		expect(end).toHaveClass("text-caption", "text-ink-3");
	});

	test("before the first entry nothing is in force", () => {
		renderHistory({ month: "2026-08" });
		expect(screen.queryByText(/^In force/)).not.toBeInTheDocument();
	});

	test("a one-month limit reads One month with Remove, and is in force in its month", () => {
		renderHistory({ rules: FOOD_RAISED });
		expect(items()).toEqual([
			"₹8,000.00 in Oct 2026 onlyIn force in October·One monthRemove",
			"₹5,000.00 from Oct 2026",
			"₹6,000.00 from Sept 2026",
			"No Budget before Sept 2026",
		]);
	});

	test("in another month a one-month limit reads One month without In force", () => {
		renderHistory({ rules: FOOD_RAISED, month: "2026-11" });
		expect(items()[0]).toBe("₹8,000.00 in Oct 2026 onlyOne monthRemove");
		expect(items()[1]).toBe("₹5,000.00 from Oct 2026In force in November");
	});

	test("Remove sends the one-month limit's month", async () => {
		// Viewing November, so the month sent is the limit's own, not the one viewed.
		const { user, onRemove } = renderHistory({
			rules: FOOD_RAISED,
			month: "2026-11",
		});
		await user.click(
			screen.getByRole("button", {
				name: "Remove ₹8,000.00 in Oct 2026 only",
			}),
		);
		expect(onRemove).toHaveBeenCalledExactlyOnceWith("2026-10");
	});

	test("entries have no Remove", () => {
		renderHistory();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("takes the caller's classes", () => {
		renderHistory({ className: "mt-2" });
		expect(screen.getByRole("region", { name: "Limit history" })).toHaveClass(
			"flex",
			"mt-2",
		);
	});
});
