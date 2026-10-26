import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { EmptyState } from "@/components/feedback/EmptyState";

describe("default", () => {
	test("says why it is empty and offers the action", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		render(
			<EmptyState
				title="No Transactions match these filters."
				body="Try a wider date range."
				action="Clear filters"
				onAction={onAction}
			/>,
		);

		expect(
			screen.getByText("No Transactions match these filters."),
		).toBeVisible();
		expect(screen.getByText("Try a wider date range.")).toBeVisible();

		await user.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(onAction).toHaveBeenCalledOnce();
	});

	test("with two actions runs each one separately", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		const onSecondary = vi.fn();
		render(
			<EmptyState
				title="No Transactions yet."
				action="Add transaction"
				onAction={onAction}
				secondary="Load demo data"
				onSecondary={onSecondary}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Load demo data" }));

		expect(onSecondary).toHaveBeenCalledOnce();
		expect(onAction).not.toHaveBeenCalled();
	});

	test("has no buttons without an action", () => {
		render(<EmptyState title="Nothing here." />);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});

describe("compact", () => {
	test("is left-aligned for small widgets", () => {
		const { container } = render(
			<EmptyState
				compact
				title="No Budgets for October 2026."
			/>,
		);

		expect(container.firstElementChild).toHaveClass("items-start", "text-left");
	});
});
