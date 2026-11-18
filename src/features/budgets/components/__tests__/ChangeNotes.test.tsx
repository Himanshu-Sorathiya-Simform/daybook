import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { BudgetChange } from "@/lib/budgets/preview";
import { goldenPreview } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import type { PreviewContext } from "../../lib/preview";
import { ChangeNotes } from "../ChangeNotes";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const FOOD: PreviewContext = { category: "food", current: "2026-11", formats: IN };

describe("ChangeNotes (BR-F04-27)", () => {
	// F04 section 5, a retroactive change.
	test("lists the notes in order", () => {
		const change: BudgetChange = {
			scope: "from",
			month: "2026-09",
			limitMinor: 700000,
		};
		render(
			<ChangeNotes
				notes={goldenPreview("food", change).notes}
				change={change}
				context={FOOD}
			/>,
		);
		const items = screen.getAllByRole("listitem");
		expect(items.map((item) => item.textContent)).toEqual([
			"This also changes September and October 2026.",
			"This replaces the change to ₹5,000.00 from October 2026.",
		]);
	});

	test("shows nothing without notes", () => {
		const { container } = render(
			<ChangeNotes
				notes={[]}
				change={{ scope: "from", month: "2026-11", limitMinor: 1 }}
				context={FOOD}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});

	test("takes a className", () => {
		const change: BudgetChange = {
			scope: "month",
			month: "2026-10",
			limitMinor: 800000,
		};
		render(
			<ChangeNotes
				notes={goldenPreview("food", change).notes}
				change={change}
				context={FOOD}
				className="extra"
			/>,
		);
		expect(screen.getByRole("list")).toHaveClass("extra");
		expect(screen.getByRole("listitem")).toHaveTextContent(
			"Only October 2026 changes. The limits for other months stay as they are.",
		);
	});
});
