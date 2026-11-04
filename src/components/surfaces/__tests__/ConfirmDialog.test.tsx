import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	ConfirmDialog,
	type ConfirmDialogProps,
} from "@/components/surfaces/ConfirmDialog";

// BR-F03-49's discard confirm.
function Host({
	onOpenChange,
	onConfirm,
	closeOnConfirm = true,
	startOpen = false,
	...props
}: Partial<Omit<ConfirmDialogProps, "isOpen">> & {
	closeOnConfirm?: boolean;
	startOpen?: boolean;
}) {
	const [isOpen, setOpen] = useState(startOpen);
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
			>
				Close the form
			</button>
			<ConfirmDialog
				title="Discard changes?"
				confirmLabel="Discard"
				cancelLabel="Keep editing"
				{...props}
				isOpen={isOpen}
				onOpenChange={(next) => {
					setOpen(next);
					onOpenChange?.(next);
				}}
				onConfirm={() => {
					onConfirm?.();
					if (closeOnConfirm) setOpen(false);
				}}
			>
				{"children" in props ?
					props.children
				:	"What you've typed here won't be saved."}
			</ConfirmDialog>
		</>
	);
}

type User = ReturnType<typeof userEvent.setup>;

async function open(user: User, name = "Discard changes?") {
	await user.click(screen.getByRole("button", { name: "Close the form" }));
	return screen.findByRole("alertdialog", { name });
}

const closed = () =>
	waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

const opener = () =>
	screen.getByRole("button", { name: "Close the form", hidden: true });

describe("showing", () => {
	test("is not in the page until it is opened", () => {
		render(<Host />);

		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	// BR-F03-49
	test("is an alert dialog named by the question, with the explanation and both answers", async () => {
		const user = userEvent.setup();
		render(<Host />);

		const dialog = await open(user);

		expect(
			within(dialog).getByRole("heading", { name: "Discard changes?" }),
		).toBeVisible();
		expect(dialog).toHaveTextContent("What you've typed here won't be saved.");
		expect(
			within(dialog).getByRole("button", { name: "Keep editing" }),
		).toBeVisible();
		expect(
			within(dialog).getByRole("button", { name: "Discard" }),
		).toBeVisible();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("says Cancel when no cancel words are given", async () => {
		render(
			<ConfirmDialog
				title="Delete this view?"
				confirmLabel="Delete"
				isOpen
				onOpenChange={() => {}}
				onConfirm={() => {}}
			/>,
		);

		const dialog = await screen.findByRole("alertdialog", {
			name: "Delete this view?",
		});

		expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeVisible();
	});

	test("shows no explanation row when there is none", async () => {
		const user = userEvent.setup();
		render(<Host>{undefined}</Host>);

		const dialog = await open(user);

		expect(dialog.querySelector(".text-ink-2.text-body")).toBeNull();
	});

	test("puts Cancel before the action, both at the end of the footer", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		const footer = within(dialog).getByRole("button", {
			name: "Discard",
		}).parentElement!;
		const parts = Array.from(footer.children);
		expect(parts[0]).toHaveClass("flex-1");
		expect(parts[1]).toHaveTextContent("Keep editing");
		expect(parts[2]).toHaveTextContent("Discard");
	});

	test("is the small dialog size", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		expect(dialog.parentElement).toHaveClass("max-w-120");
	});

	test("takes the caller's classes on the panel", async () => {
		const user = userEvent.setup();
		render(<Host className="min-h-50" />);
		const dialog = await open(user);

		expect(dialog.parentElement).toHaveClass("min-h-50");
	});
});

describe("tone", () => {
	test("the action is the danger button by default", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		expect(within(dialog).getByRole("button", { name: "Discard" })).toHaveClass(
			"border-neg",
			"text-neg",
		);
	});

	test("can be the primary button for an action that loses nothing", async () => {
		const user = userEvent.setup();
		render(
			<Host
				tone="primary"
				confirmLabel="Update view"
			/>,
		);
		const dialog = await open(user);

		const action = within(dialog).getByRole("button", { name: "Update view" });
		expect(action).toHaveClass("bg-accent");
		expect(action).not.toHaveClass("text-neg");
	});

	test("Cancel is the secondary button", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		expect(
			within(dialog).getByRole("button", { name: "Keep editing" }),
		).toHaveClass("border-line-strong", "bg-page");
	});
});

describe("focus", () => {
	test("starts on Cancel, so a stray Enter never confirms", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		render(<Host onConfirm={onConfirm} />);
		const dialog = await open(user);

		await waitFor(() =>
			expect(
				within(dialog).getByRole("button", { name: "Keep editing" }),
			).toHaveFocus(),
		);
		await user.keyboard("{Enter}");

		expect(onConfirm).not.toHaveBeenCalled();
		await closed();
	});

	test("stays inside while Tab is pressed", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		for (let i = 0; i < 6; i++) {
			await user.tab();
			expect(dialog).toContainElement(document.activeElement as HTMLElement);
		}
	});
});

describe("confirming", () => {
	test("a press on the action confirms once and leaves closing to the caller", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<Host
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
			/>,
		);
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("button", { name: "Discard" }));

		expect(onConfirm).toHaveBeenCalledOnce();
		expect(onOpenChange).not.toHaveBeenCalled();
		await closed();
	});

	test("stays open after confirming when the caller keeps it open", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		render(
			<Host
				onConfirm={onConfirm}
				closeOnConfirm={false}
			/>,
		);
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("button", { name: "Discard" }));

		expect(onConfirm).toHaveBeenCalledOnce();
		expect(screen.getByRole("alertdialog")).toBeVisible();
	});

	test("can be confirmed with the keyboard", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		render(<Host onConfirm={onConfirm} />);
		await open(user);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Keep editing" }),
			).toHaveFocus(),
		);

		await user.tab();
		expect(screen.getByRole("button", { name: "Discard" })).toHaveFocus();
		await user.keyboard("{Enter}");

		expect(onConfirm).toHaveBeenCalledOnce();
	});
});

describe("cancelling", () => {
	test.each([
		[
			"Cancel",
			(user: User) =>
				user.click(screen.getByRole("button", { name: "Keep editing" })),
		],
		[
			"Close",
			(user: User) =>
				user.click(screen.getByRole("button", { name: "Close" })),
		],
		["Escape", (user: User) => user.keyboard("{Escape}")],
	])("%s closes it without confirming, and focus goes back", async (_, act) => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<Host
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
			/>,
		);
		await open(user);

		await act(user);

		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
		expect(onConfirm).not.toHaveBeenCalled();
		await closed();
		await waitFor(() => expect(opener()).toHaveFocus());
	});

	test("a press outside does nothing, since it needs an answer", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Host onOpenChange={onOpenChange} />);
		await open(user);

		await user.click(document.body);

		expect(onOpenChange).not.toHaveBeenCalled();
		expect(screen.getByRole("alertdialog")).toBeVisible();
	});
});

describe("while the action runs", () => {
	function Pending({
		onOpenChange,
		onConfirm,
	}: {
		onOpenChange: (open: boolean) => void;
		onConfirm: () => void;
	}) {
		return (
			<ConfirmDialog
				title="Delete this view?"
				confirmLabel="Delete"
				isOpen
				isPending
				onOpenChange={onOpenChange}
				onConfirm={onConfirm}
			/>
		);
	}

	test("the action shows it is busy and takes no second press", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		render(
			<Pending
				onOpenChange={() => {}}
				onConfirm={onConfirm}
			/>,
		);
		const dialog = await screen.findByRole("alertdialog", {
			name: "Delete this view?",
		});

		const action = within(dialog).getByRole("button", { name: "Delete" });
		expect(action).toHaveAttribute("aria-disabled", "true");
		expect(action.querySelector(".animate-spin")).toBeInTheDocument();
		await user.click(action);

		expect(onConfirm).not.toHaveBeenCalled();
	});

	test("Escape, Cancel and Close wait for it", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<Pending
				onOpenChange={onOpenChange}
				onConfirm={() => {}}
			/>,
		);
		const dialog = await screen.findByRole("alertdialog");

		await user.keyboard("{Escape}");
		const cancel = within(dialog).getByRole("button", { name: "Cancel" });
		expect(cancel).toHaveAttribute("aria-disabled", "true");
		await user.click(cancel);
		await user.click(within(dialog).getByRole("button", { name: "Close" }));

		expect(onOpenChange).not.toHaveBeenCalled();
		expect(screen.getByRole("alertdialog")).toBeVisible();
	});

	test("without it, the buttons are ready", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		const action = within(dialog).getByRole("button", { name: "Discard" });
		expect(action).not.toHaveAttribute("aria-disabled");
		expect(action.querySelector(".animate-spin")).toBeNull();
		expect(
			within(dialog).getByRole("button", { name: "Keep editing" }),
		).not.toHaveAttribute("aria-disabled");
	});
});
