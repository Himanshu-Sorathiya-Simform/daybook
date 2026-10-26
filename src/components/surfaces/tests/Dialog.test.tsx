import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Button } from "@/components/actions/Button";
import { Dialog, type DialogProps } from "@/components/surfaces/Dialog";

function Host({
	onOpenChange,
	footer = true,
	startOpen = false,
	...props
}: Partial<Omit<DialogProps, "isOpen" | "onOpenChange" | "footer">> & {
	onOpenChange?: (isOpen: boolean) => void;
	footer?: boolean;
	startOpen?: boolean;
}) {
	const [isOpen, setOpen] = useState(startOpen);
	return (
		<>
			<Button onPress={() => setOpen(true)}>Open</Button>
			<Dialog
				title="New Transaction"
				{...props}
				isOpen={isOpen}
				onOpenChange={(next) => {
					setOpen(next);
					onOpenChange?.(next);
				}}
				{...(footer ?
					{ footer: <Button onPress={() => setOpen(false)}>Save</Button> }
				:	{})}
			>
				<label>
					Payee
					<input />
				</label>
			</Dialog>
		</>
	);
}

type User = ReturnType<typeof userEvent.setup>;

async function open(user: User) {
	await user.click(screen.getByRole("button", { name: "Open" }));
	return screen.findByRole("dialog", { name: "New Transaction" });
}

const closed = () =>
	waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("opening", () => {
	test("is not in the page until it is opened", () => {
		render(<Host />);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(screen.queryByText("Payee")).not.toBeInTheDocument();
	});

	test("opens when isOpen becomes true, named by its title", async () => {
		const user = userEvent.setup();
		render(<Host />);

		const dialog = await open(user);

		expect(dialog).toBeVisible();
		expect(
			screen.getByRole("heading", { level: 2, name: "New Transaction" }),
		).toBeVisible();
	});

	test("can be open from the start", async () => {
		render(<Host startOpen />);

		expect(
			await screen.findByRole("dialog", { name: "New Transaction" }),
		).toBeVisible();
	});

	test("shows the body and the footer", async () => {
		const user = userEvent.setup();
		render(<Host />);

		const dialog = await open(user);

		expect(within(dialog).getByLabelText("Payee")).toBeVisible();
		expect(within(dialog).getByRole("button", { name: "Save" })).toBeVisible();
	});

	test("can be opened again after it was closed", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);
		await user.keyboard("{Escape}");
		await closed();

		await open(user);

		expect(
			screen.getByRole("dialog", { name: "New Transaction" }),
		).toBeVisible();
	});

	test("shows a different title when it is given one", async () => {
		const user = userEvent.setup();
		render(<Host title="Edit Transaction" />);
		await user.click(screen.getByRole("button", { name: "Open" }));

		expect(
			await screen.findByRole("dialog", { name: "Edit Transaction" }),
		).toBeVisible();
	});
});

describe("closing", () => {
	test("closes with the Close button, reports it once, and returns focus to the opener", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Host onOpenChange={onOpenChange} />);
		await open(user);

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onOpenChange).toHaveBeenCalledOnce();
		expect(onOpenChange).toHaveBeenCalledWith(false);
		await closed();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Open" })).toHaveFocus(),
		);
	});

	test("closes with Escape", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Host onOpenChange={onOpenChange} />);
		await open(user);

		await user.keyboard("{Escape}");

		await closed();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test("closes from a button in the footer", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		await user.click(screen.getByRole("button", { name: "Save" }));

		await closed();
	});

	test("stays open when the parent does not update isOpen", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<Dialog
				title="Stuck"
				isOpen
				onOpenChange={onOpenChange}
			>
				Body
			</Dialog>,
		);
		await screen.findByRole("dialog");

		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onOpenChange).toHaveBeenCalledTimes(2);
		expect(screen.getByRole("dialog", { name: "Stuck" })).toBeVisible();
	});

	test("the Close button is the first thing a keyboard user reaches after the title", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		await user.tab();

		expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
	});
});

describe("pressing outside", () => {
	test("does not close it by default, so a half-filled form is not lost", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Host onOpenChange={onOpenChange} />);
		await open(user);

		await user.click(document.body);

		expect(screen.getByRole("dialog")).toBeVisible();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	test("closes it when it is dismissable", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<Host
				isDismissable
				onOpenChange={onOpenChange}
			/>,
		);
		await open(user);

		await user.click(document.body);

		await closed();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test("does not close it when the press is inside, even when it is dismissable", async () => {
		const user = userEvent.setup();
		render(<Host isDismissable />);
		await open(user);

		await user.click(screen.getByLabelText("Payee"));

		expect(screen.getByRole("dialog")).toBeVisible();
	});
});

describe("Escape can be turned off", () => {
	test("Escape does nothing, but the Close button still works", async () => {
		const user = userEvent.setup();
		render(<Host isKeyboardDismissDisabled />);
		await open(user);

		await user.keyboard("{Escape}");
		expect(screen.getByRole("dialog")).toBeVisible();

		await user.click(screen.getByRole("button", { name: "Close" }));
		await closed();
	});
});

describe("focus", () => {
	test("moves into the dialog when it opens", async () => {
		const user = userEvent.setup();
		render(<Host />);

		const dialog = await open(user);

		await waitFor(() =>
			expect(dialog).toContainElement(document.activeElement as HTMLElement),
		);
	});

	test("goes to a field marked autoFocus", async () => {
		const user = userEvent.setup();
		render(
			<Dialog
				title="Focus"
				isOpen
				onOpenChange={() => {}}
			>
				<input
					aria-label="First"
					autoFocus
				/>
			</Dialog>,
		);
		await screen.findByRole("dialog");

		await waitFor(() => expect(screen.getByLabelText("First")).toHaveFocus());
		await user.keyboard("a");
		expect(screen.getByLabelText("First")).toHaveValue("a");
	});

	test("stays inside while Tab is pressed, going round to the start", async () => {
		const user = userEvent.setup();
		render(
			<>
				<button>Outside</button>
				<Host />
			</>,
		);
		const dialog = await open(user);

		for (let i = 0; i < 8; i++) {
			await user.tab();
			expect(dialog).toContainElement(document.activeElement as HTMLElement);
		}
	});

	test("stays inside while Shift+Tab is pressed", async () => {
		const user = userEvent.setup();
		render(
			<>
				<button>Outside</button>
				<Host />
			</>,
		);
		const dialog = await open(user);

		for (let i = 0; i < 6; i++) {
			await user.tab({ shift: true });
			expect(dialog).toContainElement(document.activeElement as HTMLElement);
		}
	});

	test("lets the user type into its fields", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		await user.type(screen.getByLabelText("Payee"), "Chai Point");

		expect(screen.getByLabelText("Payee")).toHaveValue("Chai Point");
	});
});

describe("the page behind", () => {
	test("is hidden from screen readers while the dialog is open, and back when it closes", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		expect(
			screen.queryByRole("button", { name: "Open" }),
		).not.toBeInTheDocument();

		await user.keyboard("{Escape}");
		await closed();
		expect(screen.getByRole("button", { name: "Open" })).toBeVisible();
	});

	test("cannot scroll while the dialog is open, and can again after it closes", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const before = document.documentElement.style.overflow;

		await open(user);
		expect(document.documentElement.style.overflow).toBe("hidden");

		await user.keyboard("{Escape}");
		await closed();
		await waitFor(() =>
			expect(document.documentElement.style.overflow).toBe(before),
		);
	});
});

describe("role", () => {
	test("is a dialog by default", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	test("can be an alert dialog for a confirmation, still named by its title", async () => {
		const user = userEvent.setup();
		render(<Host role="alertdialog" />);
		await user.click(screen.getByRole("button", { name: "Open" }));

		expect(
			await screen.findByRole("alertdialog", { name: "New Transaction" }),
		).toBeVisible();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});

describe("footer", () => {
	test("has a footer row with a top edge when one is given", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		expect(
			screen.getByRole("button", { name: "Save" }).parentElement,
		).toHaveClass("border-t", "border-line");
	});

	test("has no footer row when there is none", async () => {
		const user = userEvent.setup();
		render(<Host footer={false} />);
		const dialog = await open(user);

		expect(dialog.querySelector(".border-t")).toBeNull();
	});
});

describe("size", () => {
	test.each([
		["sm", "max-w-120"],
		["md", "max-w-140"],
		["lg", "max-w-160"],
	] as const)("%s is at most %s wide", async (size, width) => {
		const user = userEvent.setup();
		render(<Host size={size} />);
		const dialog = await open(user);

		expect(dialog.parentElement).toHaveClass(width);
	});

	test("is medium by default", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		expect(dialog.parentElement).toHaveClass("max-w-140");
	});

	test("takes the caller's classes on the panel", async () => {
		const user = userEvent.setup();
		render(<Host className="min-h-80" />);
		const dialog = await open(user);

		expect(dialog.parentElement).toHaveClass("min-h-80");
	});
});

describe("phone layout", () => {
	test("is a bottom sheet below 768px: pinned to the bottom, rounded on top only, with a grabber", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		const panel = dialog.parentElement!;
		expect(panel.parentElement).toHaveClass("max-md:items-end", "max-md:p-0");
		expect(panel).toHaveClass(
			"max-md:rounded-b-none",
			"max-md:rounded-t-card",
			"max-md:max-h-full",
		);
		expect(dialog.querySelector("[aria-hidden='true']")).toHaveClass(
			"md:hidden",
		);
	});

	test("has a centred panel near the top from 768px up", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		expect(dialog.parentElement!.parentElement).toHaveClass(
			"items-start",
			"justify-center",
			"pt-12",
			"bg-scrim",
		);
	});

	test("scrolls only its body, so the title and the footer stay", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const dialog = await open(user);

		expect(
			screen.getByLabelText("Payee").closest(".overflow-y-auto"),
		).toBeInTheDocument();
		expect(dialog).toHaveClass("min-h-0");
	});
});
