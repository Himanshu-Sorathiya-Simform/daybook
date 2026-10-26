import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Toast } from "@/components/feedback/Toast";

describe("message", () => {
	test("shows its message", () => {
		render(<Toast>Transaction deleted.</Toast>);

		expect(screen.getByText("Transaction deleted.")).toBeVisible();
	});

	test("shows rich content", () => {
		render(
			<Toast>
				Saved <strong>2 changes</strong>.
			</Toast>,
		);

		expect(screen.getByText("2 changes")).toBeVisible();
	});

	test("has no role of its own, because Sonner's live region announces it", () => {
		render(<Toast>Transaction deleted.</Toast>);

		expect(screen.queryByRole("status")).not.toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});

describe("action", () => {
	test("runs onAction with the mouse, Enter and Space", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		render(
			<Toast
				action="Undo"
				onAction={onAction}
			>
				Transaction deleted.
			</Toast>,
		);

		await user.click(screen.getByRole("button", { name: "Undo" }));
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(onAction).toHaveBeenCalledTimes(3);
	});

	test("is reached with Tab and shows the focus ring in a colour that reads on the dark surface", async () => {
		const user = userEvent.setup();
		render(
			<Toast
				action="Show"
				onAction={() => {}}
			>
				Saved. It&apos;s hidden by your filters.
			</Toast>,
		);

		await user.tab();

		const button = screen.getByRole("button", { name: "Show" });
		expect(button).toHaveFocus();
		expect(button).toHaveClass("outline-page", "underline");
	});

	test("does not fail when pressed without onAction", async () => {
		const user = userEvent.setup();
		render(<Toast action="Undo">Transaction deleted.</Toast>);

		await user.click(screen.getByRole("button", { name: "Undo" }));

		expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();
	});

	test("has no button without an action label", () => {
		render(<Toast onAction={() => {}}>Demo data added.</Toast>);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("comes after the message and is 44px on phones", () => {
		render(
			<Toast
				action="Undo"
				onAction={() => {}}
			>
				Deleted.
			</Toast>,
		);

		const button = screen.getByRole("button", { name: "Undo" });
		expect(
			screen.getByText("Deleted.").compareDocumentPosition(button)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(button).toHaveClass("max-md:min-h-11");
	});
});

describe("tone", () => {
	test("has no icon when neutral", () => {
		const { container } = render(<Toast>Demo data added.</Toast>);

		expect(container.querySelector("svg")).toBeNull();
	});

	test("shows a decorative alert icon for an error, so it is not colour alone", () => {
		const { container } = render(<Toast tone="error">Could not save.</Toast>);

		expect(container.querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
		expect(container.querySelector("svg")).toHaveClass("text-neg-soft");
	});

	test("is the same inverse surface for both tones", () => {
		const { container, rerender } = render(<Toast>One</Toast>);
		expect(container.firstElementChild).toHaveClass("bg-ink", "text-page");

		rerender(<Toast tone="error">One</Toast>);
		expect(container.firstElementChild).toHaveClass("bg-ink", "text-page");
	});
});

describe("look", () => {
	test("is at least 44px tall and at most 420px wide, with a popover shadow", () => {
		const { container } = render(<Toast>Message</Toast>);

		expect(container.firstElementChild).toHaveClass(
			"min-h-11",
			"max-w-105",
			"shadow-popover",
			"rounded-chip",
		);
	});

	test("takes the caller's classes after its own", () => {
		const { container } = render(<Toast className="max-w-sm">Message</Toast>);

		expect(container.firstElementChild).toHaveClass("max-w-sm");
		expect(container.firstElementChild).not.toHaveClass("max-w-105");
	});
});
