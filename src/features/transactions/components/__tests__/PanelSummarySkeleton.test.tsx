import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { PanelSummarySkeleton } from "../PanelSummarySkeleton";

describe("PanelSummarySkeleton (BR-F03-71)", () => {
	test("is one busy status named Loading the summary", () => {
		render(<PanelSummarySkeleton />);
		expect(
			screen.getByRole("status", { name: "Loading the summary" }),
		).toHaveAttribute("aria-busy", "true");
	});

	test("holds every fixed word of the real panel in place", () => {
		render(<PanelSummarySkeleton />);
		const status = screen.getByRole("status");
		for (const text of [
			"This list",
			"Out by category",
			"Top payees by Out",
			"Select a Transaction to see it here. Up and down arrows move, Enter opens.",
		]) {
			expect(within(status).getByText(text)).toBeVisible();
		}
	});

	test("draws five category rows and four payee rows, as bars in the real grid", () => {
		const { container } = render(<PanelSummarySkeleton />);
		expect(container.querySelectorAll(".grid-cols-subgrid")).toHaveLength(5);
		expect(container.querySelectorAll(".h-9")).toHaveLength(4);
	});

	test("has no figure, button or list to read", () => {
		render(<PanelSummarySkeleton />);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByRole("list")).toBeNull();
		expect(screen.queryByText(/₹/)).toBeNull();
	});

	test("the bars are hidden from screen readers", () => {
		const { container } = render(<PanelSummarySkeleton />);
		for (const bar of container.querySelectorAll(".bg-track")) {
			expect(bar.closest("[aria-hidden=true]") ?? bar).toHaveAttribute(
				"aria-hidden",
				"true",
			);
		}
	});

	test("takes extra classes for its root", () => {
		render(<PanelSummarySkeleton className="extra" />);
		expect(screen.getByRole("status")).toHaveClass("extra", "flex-col");
	});
});
