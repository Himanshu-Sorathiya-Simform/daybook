import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { EmptyState } from "@/components/feedback/EmptyState";

describe("content", () => {
	test("says why it is empty", () => {
		render(<EmptyState title="No Transactions match these filters." />);

		expect(
			screen.getByText("No Transactions match these filters."),
		).toBeVisible();
	});

	test("shows the body under the title", () => {
		render(
			<EmptyState
				title="No Transactions yet."
				body="Add your first Transaction to see your month take shape."
			/>,
		);

		const body = screen.getByText(
			"Add your first Transaction to see your month take shape.",
		);
		expect(body).toHaveClass("text-ink-2", "max-w-105");
		expect(
			screen.getByText("No Transactions yet.").compareDocumentPosition(body)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("shows no body unless given", () => {
		const { container } = render(<EmptyState title="Nothing here." />);

		expect(container.querySelectorAll("p")).toHaveLength(1);
	});

	test("has no buttons without an action", () => {
		render(<EmptyState title="Nothing here." />);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("makes the title stand out", () => {
		render(<EmptyState title="Nothing here." />);

		expect(screen.getByText("Nothing here.")).toHaveClass(
			"font-semibold",
			"text-ink",
		);
	});
});

describe("one action", () => {
	test("is a small secondary button that runs onAction", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		render(
			<EmptyState
				title="No Transactions match these filters."
				action="Clear filters"
				onAction={onAction}
			/>,
		);

		const button = screen.getByRole("button", { name: "Clear filters" });
		await user.click(button);

		expect(onAction).toHaveBeenCalledOnce();
		expect(button).toHaveClass("h-8", "bg-page", "border-line-strong");
	});

	test("works with the keyboard", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		render(
			<EmptyState
				title="Nothing."
				action="Retry"
				onAction={onAction}
			/>,
		);

		await user.tab();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(onAction).toHaveBeenCalledTimes(2);
	});

	test("does not fail when pressed without onAction", async () => {
		const user = userEvent.setup();
		render(
			<EmptyState
				title="Nothing."
				action="Retry"
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Retry" }));

		expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
	});
});

describe("two actions", () => {
	test("makes the first the main one and the second plain, and runs each separately", async () => {
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

		const main = screen.getByRole("button", { name: "Add transaction" });
		const other = screen.getByRole("button", { name: "Load demo data" });
		expect(main).toHaveClass("bg-accent", "text-on-accent");
		expect(other).toHaveClass("bg-page", "text-ink");

		await user.click(other);
		expect(onSecondary).toHaveBeenCalledOnce();
		expect(onAction).not.toHaveBeenCalled();

		await user.click(main);
		expect(onAction).toHaveBeenCalledOnce();
	});

	test("puts the main action first, in the tab order too", async () => {
		const user = userEvent.setup();
		render(
			<EmptyState
				title="No Transactions yet."
				action="Add transaction"
				secondary="Load demo data"
			/>,
		);

		await user.tab();
		expect(
			screen.getByRole("button", { name: "Add transaction" }),
		).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: "Load demo data" })).toHaveFocus();
	});

	test("shows a lone secondary action as a plain button", () => {
		render(
			<EmptyState
				title="Nothing."
				secondary="Load demo data"
			/>,
		);

		expect(screen.getAllByRole("button")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Load demo data" })).toHaveClass(
			"bg-page",
		);
	});

	test("does not fail when the second is pressed without onSecondary", async () => {
		const user = userEvent.setup();
		render(
			<EmptyState
				title="Nothing."
				action="A"
				secondary="B"
			/>,
		);

		await user.click(screen.getByRole("button", { name: "B" }));

		expect(screen.getByRole("button", { name: "B" })).toBeVisible();
	});
});

describe("layout", () => {
	test("is centred with room around it by default", () => {
		const { container } = render(<EmptyState title="Nothing." />);

		expect(container.firstElementChild).toHaveClass(
			"items-center",
			"text-center",
			"py-10",
			"px-4",
		);
	});

	test("is a left-aligned single line when compact, with a small gap", () => {
		const { container } = render(
			<EmptyState
				compact
				title="No Budgets for October 2026."
			/>,
		);

		expect(container.firstElementChild).toHaveClass(
			"items-start",
			"text-left",
			"py-2",
		);
		expect(container.firstElementChild).not.toHaveClass(
			"items-center",
			"text-center",
		);
	});

	test("takes the caller's classes after its own", () => {
		const { container } = render(
			<EmptyState
				title="Nothing."
				className="w-96 py-4"
			/>,
		);

		expect(container.firstElementChild).toHaveClass("w-96", "py-4");
		expect(container.firstElementChild).not.toHaveClass("py-10");
	});
});
