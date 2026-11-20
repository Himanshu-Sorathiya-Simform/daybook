import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import type { PastChoices } from "../../lib/dialog";
import { PastCharges, type PastChargesProps } from "../PastCharges";

const CHOICES: PastChoices = {
	count: 14,
	heading: "Netflix started 14 months before today. Add the charges from before?",
	no: {
		title: "No, start with the next one",
		description:
			"First charge: Thu, 5 Nov. Pick this if the past payments are already in Transactions, or you don't need them.",
	},
	yes: {
		title: "Yes, add 14 past charges, ₹9,086.00",
		description:
			"One expense on each due date, from 5 Sept 2025 to 5 Oct 2026. They count in those months' spending, Budgets and reports.",
	},
};

function setup(props: Partial<PastChargesProps> = {}) {
	const onChange = vi.fn();
	renderInApp(
		<PastCharges
			choices={CHOICES}
			value="no"
			onChange={onChange}
			duplicates={null}
			{...props}
		/>,
	);
	return { onChange, user: userEvent.setup() };
}

describe("the past-charges choice (BR-F05-04)", () => {
	test("is a pair of choices under the heading, No first", () => {
		setup();
		expect(
			screen.getByRole("radiogroup", { name: CHOICES.heading }),
		).toBeVisible();
		expect(
			screen
				.getAllByRole("radio")
				.map((radio) => radio.closest("label")?.textContent),
		).toEqual([
			expect.stringContaining("No, start with the next one"),
			expect.stringContaining("Yes, add 14 past charges, ₹9,086.00"),
		]);
	});

	test("each choice is described", () => {
		setup();
		expect(screen.getByText(CHOICES.no.description)).toBeVisible();
		expect(screen.getByText(CHOICES.yes.description)).toBeVisible();
	});

	test("the given value is the chosen one", () => {
		setup({ value: "yes" });
		expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName(
			/^Yes, add 14 past charges/,
		);
	});

	test("choosing Yes reports it", async () => {
		const { user, onChange } = setup();
		await user.click(screen.getByRole("radio", { name: /^Yes/ }));
		expect(onChange).toHaveBeenCalledWith("yes");
	});

	test("choosing No reports it", async () => {
		const { user, onChange } = setup({ value: "yes" });
		await user.click(screen.getByRole("radio", { name: /^No/ }));
		expect(onChange).toHaveBeenCalledWith("no");
	});

	test("the arrow keys move between them", async () => {
		const { user, onChange } = setup();
		await user.tab();
		await user.keyboard("{ArrowDown}");
		expect(onChange).toHaveBeenCalledWith("yes");
	});

	test("without duplicates there is no note", () => {
		setup();
		expect(screen.queryByRole("status")).toBeNull();
	});

	test("with duplicates a note follows", () => {
		setup({
			duplicates:
				"You already have 2 Netflix expenses in that period, on 5 Sept, 5 Oct. Adding past charges would count them twice.",
		});
		expect(screen.getByRole("status")).toHaveTextContent(
			"You already have 2 Netflix expenses in that period",
		);
	});

	test("the note shows under either choice", () => {
		setup({ value: "yes", duplicates: "You already have 1 Netflix expense." });
		expect(screen.getByRole("status")).toBeVisible();
	});

	test("a disabled choice cannot be changed", () => {
		setup({ isDisabled: true });
		expect(screen.getAllByRole("radio")[0]).toBeDisabled();
	});
});
