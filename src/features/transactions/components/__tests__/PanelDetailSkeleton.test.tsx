import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { PanelDetailSkeleton } from "../PanelDetailSkeleton";

describe("PanelDetailSkeleton (BR-F03-70)", () => {
	test("is one busy status named Loading the Transaction", () => {
		render(<PanelDetailSkeleton />);
		expect(
			screen.getByRole("status", { name: "Loading the Transaction" }),
		).toHaveAttribute("aria-busy", "true");
	});

	test("shows the five terms the detail always has, with bars for their values", () => {
		const { container } = render(<PanelDetailSkeleton />);
		const terms = container.querySelectorAll("dt");
		expect([...terms].map((t) => t.textContent)).toEqual([
			"Type",
			"Category",
			"Date",
			"Source",
			"Note",
		]);
		expect(container.querySelectorAll("dd")).toHaveLength(5);
	});

	test("holds the amount at its readout height and the soft box for the payee's history", () => {
		const { container } = render(<PanelDetailSkeleton />);
		expect(container.querySelector(".h-15\\.75")).not.toBeNull();
		expect(container.querySelector(".bg-soft")).not.toBeNull();
	});

	test("holds the three buttons and their hint", () => {
		const { container } = render(<PanelDetailSkeleton />);
		expect(container.querySelectorAll(".h-9\\.5")).toHaveLength(3);
		expect(within(screen.getByRole("status")).queryByRole("button")).toBeNull();
	});

	test("has no real figure or text of a Transaction", () => {
		render(<PanelDetailSkeleton />);
		expect(screen.queryByText(/₹/)).toBeNull();
	});
});
