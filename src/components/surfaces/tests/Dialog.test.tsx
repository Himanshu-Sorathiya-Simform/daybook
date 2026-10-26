import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Button } from "@/components/actions/Button";
import { Dialog, type DialogProps } from "@/components/surfaces/Dialog";

function Host({
	onClose,
	...props
}: Partial<Omit<DialogProps, "isOpen" | "onOpenChange">> & {
	onClose?: () => void;
}) {
	const [isOpen, setOpen] = useState(false);
	return (
		<>
			<Button onPress={() => setOpen(true)}>Open</Button>
			<Dialog
				title="New Transaction"
				{...props}
				isOpen={isOpen}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) onClose?.();
				}}
				footer={<Button onPress={() => setOpen(false)}>Save</Button>}
			>
				<label>
					Payee
					<input />
				</label>
			</Dialog>
		</>
	);
}

async function open(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Open" }));
	return screen.findByRole("dialog", { name: "New Transaction" });
}

describe("default", () => {
	test("is closed until opened, then is a modal named by its title", async () => {
		const user = userEvent.setup();
		render(<Host />);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

		const dialog = await open(user);

		expect(dialog).toBeVisible();
		expect(
			screen.getByRole("heading", { name: "New Transaction" }),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
	});

	test("closes with the Close button and returns focus to the button that opened it", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<Host onClose={onClose} />);
		await open(user);

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onClose).toHaveBeenCalledOnce();
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Open" })).toHaveFocus(),
		);
	});

	test("closes with Escape", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		await user.keyboard("{Escape}");

		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});

	test("keeps focus inside while open", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		for (let i = 0; i < 6; i++) await user.tab();

		expect(dialog).toContainElement(document.activeElement as HTMLElement);
	});
});

describe("dismissing", () => {
	test("a press outside does not close it by default", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		await user.click(document.body);

		expect(screen.getByRole("dialog")).toBeVisible();
	});

	test("a press outside closes it when it is dismissable", async () => {
		const user = userEvent.setup();
		render(<Host isDismissable />);
		await open(user);

		await user.click(document.body);

		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});

	test("Escape does nothing when keyboard dismissal is off", async () => {
		const user = userEvent.setup();
		render(<Host isKeyboardDismissDisabled />);
		await open(user);

		await user.keyboard("{Escape}");

		expect(screen.getByRole("dialog")).toBeVisible();
	});
});

describe("role", () => {
	test("can be an alert dialog for a confirmation", async () => {
		const user = userEvent.setup();
		render(<Host role="alertdialog" />);
		await user.click(screen.getByRole("button", { name: "Open" }));

		expect(
			await screen.findByRole("alertdialog", { name: "New Transaction" }),
		).toBeVisible();
	});
});
