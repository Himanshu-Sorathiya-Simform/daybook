import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { UndoNotice, type UndoNoticeProps } from "../UndoNotice";

function renderNotice(props: Partial<UndoNoticeProps> = {}) {
	const handlers = { onUndo: vi.fn(), onDismiss: vi.fn() };
	const view = render(
		<UndoNotice
			text="Food Budget deleted."
			{...handlers}
			{...props}
		/>,
	);
	return { ...view, ...handlers, user: userEvent.setup() };
}

describe("UndoNotice (BR-F04-29)", () => {
	test("is a status with the text, Undo and Dismiss", () => {
		renderNotice();
		expect(screen.getByRole("status")).toHaveTextContent("Food Budget deleted.");
		expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Dismiss" })).toBeVisible();
	});

	test("Undo and Dismiss call their handlers", async () => {
		const { user, onUndo, onDismiss } = renderNotice();
		await user.click(screen.getByRole("button", { name: "Undo" }));
		expect(onUndo).toHaveBeenCalledOnce();
		expect(onDismiss).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Dismiss" }));
		expect(onDismiss).toHaveBeenCalledOnce();
	});

	test("works from the keyboard", async () => {
		const { user, onUndo, onDismiss } = renderNotice();
		await user.tab();
		expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
		await user.keyboard("{Enter}");
		expect(onUndo).toHaveBeenCalledOnce();
		await user.tab();
		expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
		await user.keyboard(" ");
		expect(onDismiss).toHaveBeenCalledOnce();
	});

	test("a failure is an alert with Dismiss alone", () => {
		renderNotice({
			text: "This Budget was deleted on another device.",
			isFailure: true,
		});
		expect(screen.getByRole("alert")).toHaveTextContent(
			"This Budget was deleted on another device.",
		);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Dismiss" })).toBeVisible();
	});

	test("without an Undo handler there is no Undo, as after a failure", () => {
		const { container } = render(
			<UndoNotice
				text="x"
				onDismiss={() => {}}
			/>,
		);
		expect(
			container.querySelector("button[type=button]:not([aria-label])"),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Undo" }),
		).not.toBeInTheDocument();
	});

	test("while Undo is on its way, Dismiss rests and Undo ignores presses", async () => {
		const { user, onUndo, onDismiss } = renderNotice({ isPending: true });
		expect(screen.getByRole("button", { name: "Dismiss" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await user.click(screen.getByRole("button", { name: "Undo" }));
		await user.click(screen.getByRole("button", { name: "Dismiss" }));
		expect(onUndo).not.toHaveBeenCalled();
		expect(onDismiss).not.toHaveBeenCalled();
	});

	test("an icon is hidden from screen readers", () => {
		const { container } = renderNotice();
		expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
	});

	test("takes a className on its root", () => {
		renderNotice({ className: "extra" });
		expect(screen.getByRole("status")).toHaveClass("extra");
	});
});
