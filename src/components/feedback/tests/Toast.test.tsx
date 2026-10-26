import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Toast } from "@/components/feedback/Toast";
import { Toaster } from "@/components/feedback/Toaster";
import { dismissToast, showToast } from "@/components/feedback/showToast";

describe("Toast", () => {
	test("shows its message and runs the action when it is pressed", async () => {
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

		expect(screen.getByText("Transaction deleted.")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Undo" }));

		expect(onAction).toHaveBeenCalledOnce();
	});

	test("has no button without an action", () => {
		render(<Toast>Demo data added.</Toast>);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("shows a decorative icon for an error", () => {
		const { container } = render(<Toast tone="error">Could not save.</Toast>);

		expect(container.querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});
});

describe("showToast", () => {
	test("shows the message in the toaster", async () => {
		render(<Toaster />);

		act(() => {
			showToast("Demo data added.");
		});

		expect(await screen.findByText("Demo data added.")).toBeVisible();
	});

	test("runs the action and closes the toast", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		render(<Toaster />);

		act(() => {
			showToast("Insight dismissed.", { action: "Undo", onAction });
		});
		await user.click(await screen.findByRole("button", { name: "Undo" }));

		expect(onAction).toHaveBeenCalledOnce();
		await vi.waitFor(() =>
			expect(screen.queryByText("Insight dismissed.")).not.toBeInTheDocument(),
		);
	});

	test("can be closed early by its id", async () => {
		render(<Toaster />);

		let id: string | number = "";
		act(() => {
			id = showToast("Saved.", { duration: 60_000 });
		});
		expect(await screen.findByText("Saved.")).toBeVisible();

		act(() => dismissToast(id));

		await vi.waitFor(() =>
			expect(screen.queryByText("Saved.")).not.toBeInTheDocument(),
		);
	});
});
