import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BudgetsSkeleton } from "../BudgetsSkeleton";

describe("BudgetsSkeleton (section 6)", () => {
	test("says the Budgets are loading, as a busy status", () => {
		render(<BudgetsSkeleton />);
		const status = screen.getByRole("status", { name: "Loading Budgets" });
		expect(status).toHaveAttribute("aria-busy", "true");
	});

	test("a skeleton overview and three skeleton rows", () => {
		const { container } = render(<BudgetsSkeleton />);
		const [overview, list] = container.querySelectorAll("section, div > div");
		expect(overview).toBeDefined();
		expect(list).toBeDefined();
		const rows = container.querySelectorAll(".py-3\\.5");
		expect(rows).toHaveLength(3);
	});

	test("the overview's figure is sized like the real readout, so nothing shifts", () => {
		const { container } = render(<BudgetsSkeleton />);
		expect(container.querySelector(".h-11.w-65")).not.toBeNull();
	});
});
