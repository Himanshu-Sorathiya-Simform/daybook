import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GridList as AriaGridList } from "react-aria-components";
import { describe, expect, test, vi } from "vitest";

import { Button } from "@/components/actions/Button";
import { SideListItem, type SideListItemProps } from "../SideListItem";

function renderItem(props: Partial<SideListItemProps> = {}) {
	const onAction = vi.fn();
	const onSelectionChange = vi.fn();
	render(
		<AriaGridList
			aria-label="Budgets"
			selectionMode="single"
			onSelectionChange={onSelectionChange}
		>
			<SideListItem
				id="unbudgeted:housing"
				category="housing"
				caption="No limit in October"
				amount="₹18,000.00"
				actions={
					<Button
						size="sm"
						variant="ghost"
						onPress={onAction}
					>
						Add a Budget
					</Button>
				}
				{...props}
			/>
		</AriaGridList>,
	);
	return { onAction, onSelectionChange, user: userEvent.setup() };
}

describe("SideListItem (BR-F04-15)", () => {
	test("a row with its id, named by the category, caption and amount", () => {
		renderItem();
		const row = screen.getByRole("row");
		expect(row).toHaveAttribute("data-key", "unbudgeted:housing");
		expect(row).toHaveAccessibleName("Housing, No limit in October, ₹18,000.00");
	});

	test("shows the category, the caption, the amount and the actions", () => {
		renderItem();
		const row = screen.getByRole("row");
		expect(within(row).getByText("Housing")).toBeVisible();
		expect(within(row).getByText("No limit in October")).toBeVisible();
		expect(within(row).getByText("₹18,000.00")).toBeVisible();
		expect(
			within(row).getByRole("button", { name: "Add a Budget" }),
		).toBeVisible();
	});

	test("without an amount, as under Not active, it shows none and is named without it", () => {
		render(
			<AriaGridList aria-label="Not active this month">
				<SideListItem
					id="inactive:housing"
					category="housing"
					caption="Starts October 2026"
					actions={null}
				/>
			</AriaGridList>,
		);
		expect(screen.getByRole("row")).toHaveAccessibleName(
			"Housing, Starts October 2026",
		);
		expect(screen.getByRole("row")).not.toHaveTextContent("₹");
	});

	test("an action runs without selecting the row; a press on the row selects it", async () => {
		const { user, onAction, onSelectionChange } = renderItem();
		await user.click(screen.getByRole("button", { name: "Add a Budget" }));
		expect(onAction).toHaveBeenCalledOnce();
		expect(onSelectionChange).not.toHaveBeenCalled();
		await user.click(screen.getByText("Housing"));
		expect(onSelectionChange).toHaveBeenCalledOnce();
	});

	test("hover, selection and focus look, and the caller's classes", () => {
		renderItem({ className: "mt-1" });
		expect(screen.getByRole("row")).toHaveClass(
			"hover:bg-soft",
			"selected:bg-accent-soft",
			"min-h-14",
			"mt-1",
		);
	});
});
