import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GridList as AriaGridList } from "react-aria-components";
import { describe, expect, test } from "vitest";

import type { Group } from "@/lib/transactions/model";
import { idOf, row } from "../../lib/__tests__/fixtures";
import type { LabelLocale } from "../../lib/labels";
import { TransactionListItem } from "../TransactionListItem";

const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

function renderItems(
	rows: ReturnType<typeof row>[],
	{ group = "day", className }: { group?: Group; className?: string } = {},
) {
	return render(
		<AriaGridList aria-label="Transactions">
			{rows.map((each) => (
				<TransactionListItem
					key={each.id}
					row={each}
					group={group}
					locale={IN}
					{...(className ? { className } : {})}
				/>
			))}
		</AriaGridList>,
	);
}

describe("TransactionListItem (BR-F03-32)", () => {
	test("is a grid row named by its whole reading, and keyed by the row's id", () => {
		renderItems([row()]);

		const item = screen.getByRole("row");
		expect(item).toHaveAccessibleName("Swiggy, Food, 10:15 pm, −₹640.00");
		expect(item).toHaveAttribute("data-key", row().id);
	});

	test("shows the row inside one grid cell", () => {
		renderItems([row()]);

		const cell = screen.getByRole("gridcell");
		expect(cell).toHaveTextContent("Swiggy");
		expect(cell).toHaveTextContent("−₹640.00");
	});

	test("words its time by the grouping", () => {
		renderItems([row()], { group: "none" });

		expect(screen.getByRole("row")).toHaveAccessibleName(
			"Swiggy, Food, Mon, 19 Oct · 10:15 pm, −₹640.00",
		);
	});

	test("typing a payee's first letters moves to its row", async () => {
		const user = userEvent.setup();
		renderItems([
			row({
				id: idOf(1),
				payee: "Acme Corp",
				category: "salary",
				type: "income",
			}),
			row({ id: idOf(2), payee: "Zomato" }),
		]);
		screen.getAllByRole("row")[0]!.focus();

		await user.keyboard("zo");

		expect(screen.getAllByRole("row")[1]).toHaveFocus();
	});

	test("shows a focus ring for the keyboard, and is 44px or more tall", () => {
		renderItems([row()]);

		expect(screen.getByRole("row")).toHaveClass("focus-visible:focus-ring");
		expect(screen.getByRole("row").querySelector(".h-13\\.5")).not.toBeNull();
	});

	test("takes the caller's classes", () => {
		renderItems([row()], { className: "bg-soft" });

		expect(screen.getByRole("row")).toHaveClass("bg-soft", "rounded-control");
	});

	test("follows a row that changes", () => {
		const { rerender } = renderItems([row()]);

		rerender(
			<AriaGridList aria-label="Transactions">
				<TransactionListItem
					row={row({ amountMinor: 70000, description: "Team lunch" })}
					group="day"
					locale={IN}
				/>
			</AriaGridList>,
		);

		expect(screen.getByRole("row")).toHaveAccessibleName(
			"Swiggy, Food: Team lunch, 10:15 pm, −₹700.00",
		);
	});
});
