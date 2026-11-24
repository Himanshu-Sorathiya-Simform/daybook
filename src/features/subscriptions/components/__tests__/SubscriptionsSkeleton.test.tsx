import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { SubscriptionsSkeleton } from "../SubscriptionsSkeleton";

describe("SubscriptionsSkeleton (section 6)", () => {
	test("says the Subscriptions are loading, as a busy status", () => {
		render(<SubscriptionsSkeleton />);
		const status = screen.getByRole("status", {
			name: "Loading Subscriptions",
		});
		expect(status).toHaveAttribute("aria-busy", "true");
	});

	test("a skeleton summary and four skeleton rows", () => {
		const { container } = render(<SubscriptionsSkeleton />);
		expect(container.querySelectorAll("section")).toHaveLength(2);
		expect(container.querySelectorAll(".py-3\\.5")).toHaveLength(4);
	});

	test("the summary's figure is sized like the real readout, so nothing shifts", () => {
		const { container } = render(<SubscriptionsSkeleton />);
		expect(container.querySelector(".h-11.w-60")).not.toBeNull();
	});

	test("shows no panel and no text of its own", () => {
		const { container } = render(<SubscriptionsSkeleton />);
		expect(container.textContent).toBe("");
		expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
	});
});
