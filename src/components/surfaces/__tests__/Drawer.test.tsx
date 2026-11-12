import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Drawer, type DrawerProps } from "@/components/surfaces/Drawer";

function Host({
	onOpenChange,
	startOpen = false,
	children,
	...props
}: Partial<Omit<DrawerProps, "isOpen" | "onOpenChange" | "children">> & {
	onOpenChange?: (isOpen: boolean) => void;
	startOpen?: boolean;
	children?: DrawerProps["children"];
}) {
	const [isOpen, setOpen] = useState(startOpen);
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
			>
				Swiggy
			</button>
			<Drawer
				label="Transaction details"
				{...props}
				isOpen={isOpen}
				onOpenChange={(next) => {
					setOpen(next);
					onOpenChange?.(next);
				}}
			>
				{children
					?? ((close) => (
						<>
							<h2>Transaction</h2>
							<button
								type="button"
								onClick={close}
							>
								Close details
							</button>
							<button type="button">Edit</button>
						</>
					))}
			</Drawer>
		</>
	);
}

type User = ReturnType<typeof userEvent.setup>;

async function open(user: User) {
	await user.click(screen.getByRole("button", { name: "Swiggy" }));
	return screen.findByRole("dialog", { name: "Transaction details" });
}

const closed = () =>
	waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

const opener = () => screen.getByRole("button", { name: "Swiggy", hidden: true });

describe("opening", () => {
	test("is not in the page until it is opened", () => {
		render(<Host />);

		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByText("Transaction")).toBeNull();
	});

	test("opens as a modal dialog named by its label, showing its content", async () => {
		const user = userEvent.setup();
		render(<Host />);

		const drawer = await open(user);

		expect(drawer).toBeVisible();
		expect(
			within(drawer).getByRole("heading", { name: "Transaction" }),
		).toBeVisible();
	});

	test("adds no heading or Close button of its own, so its content brings them", async () => {
		const user = userEvent.setup();
		render(<Host>{<p>Only this</p>}</Host>);

		const drawer = await open(user);

		expect(within(drawer).queryByRole("heading")).toBeNull();
		expect(within(drawer).queryByRole("button")).toBeNull();
		expect(drawer).toHaveTextContent(/^Only this$/);
	});

	test("can be open from the start", async () => {
		render(<Host startOpen />);

		expect(
			await screen.findByRole("dialog", { name: "Transaction details" }),
		).toBeVisible();
	});

	test("moves focus into the drawer", async () => {
		const user = userEvent.setup();
		render(<Host />);

		const drawer = await open(user);

		await waitFor(() =>
			expect(drawer).toContainElement(document.activeElement as HTMLElement),
		);
	});

	test("can be opened again after it closed", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);
		await user.keyboard("{Escape}");
		await closed();

		expect(await open(user)).toBeVisible();
	});
});

describe("closing", () => {
	test("its content's Close button closes it through close, and focus goes back", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Host onOpenChange={onOpenChange} />);
		const drawer = await open(user);

		await user.click(
			within(drawer).getByRole("button", { name: "Close details" }),
		);

		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
		await closed();
		await waitFor(() => expect(opener()).toHaveFocus());
	});

	test("Escape closes it and focus goes back", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Host onOpenChange={onOpenChange} />);
		await open(user);

		await user.keyboard("{Escape}");

		expect(onOpenChange).toHaveBeenCalledWith(false);
		await closed();
		await waitFor(() => expect(opener()).toHaveFocus());
	});

	test("a press on the scrim closes it", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Host onOpenChange={onOpenChange} />);
		await open(user);

		await user.click(document.body);

		expect(onOpenChange).toHaveBeenCalledWith(false);
		await closed();
	});

	test("a press on the scrim does nothing when it is not dismissable", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<Host
				isDismissable={false}
				onOpenChange={onOpenChange}
			/>,
		);
		await open(user);

		await user.click(document.body);

		expect(onOpenChange).not.toHaveBeenCalled();
		expect(screen.getByRole("dialog")).toBeVisible();
	});

	test("a press inside keeps it open", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const drawer = await open(user);

		await user.click(within(drawer).getByRole("button", { name: "Edit" }));

		expect(screen.getByRole("dialog")).toBeVisible();
	});

	test("stays open while the parent keeps isOpen", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<Drawer
				label="Transaction details"
				isOpen
				onOpenChange={onOpenChange}
			>
				{(close) => (
					<button
						type="button"
						onClick={close}
					>
						Close details
					</button>
				)}
			</Drawer>,
		);
		await screen.findByRole("dialog");

		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Close details" }));

		expect(onOpenChange).toHaveBeenCalledTimes(2);
		expect(screen.getByRole("dialog")).toBeVisible();
	});
});

describe("focus", () => {
	test("Tab stays inside", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const drawer = await open(user);

		for (let i = 0; i < 5; i++) {
			await user.tab();
			expect(drawer).toContainElement(document.activeElement as HTMLElement);
		}
	});

	test("Shift+Tab stays inside", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const drawer = await open(user);

		for (let i = 0; i < 5; i++) {
			await user.tab({ shift: true });
			expect(drawer).toContainElement(document.activeElement as HTMLElement);
		}
	});

	test("goes to a control marked autoFocus", async () => {
		render(
			<Host startOpen>
				<button
					type="button"
					autoFocus
				>
					Edit
				</button>
			</Host>,
		);

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus(),
		);
	});
});

describe("the page behind", () => {
	test("is hidden from screen readers while open, and back after", async () => {
		const user = userEvent.setup();
		render(<Host />);
		await open(user);

		expect(screen.queryByRole("button", { name: "Swiggy" })).toBeNull();

		await user.keyboard("{Escape}");
		await closed();
		expect(screen.getByRole("button", { name: "Swiggy" })).toBeVisible();
	});

	test("cannot scroll while open, and can again after", async () => {
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

describe("layout", () => {
	test("sits on the right edge over a scrim, the height of the visible screen", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const drawer = await open(user);

		expect(drawer.parentElement!.parentElement).toHaveClass(
			"bg-scrim",
			"fixed",
			"inset-0",
			"justify-end",
			"h-(--visual-viewport-height)",
		);
	});

	test("is at most 420px wide and the full width of a phone (BR-F03-70)", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const drawer = await open(user);

		expect(drawer.parentElement).toHaveClass("w-full", "max-w-105", "h-full");
	});

	test("rounds its left corners only from 768px, where it does not fill the screen", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const drawer = await open(user);

		expect(drawer.parentElement).toHaveClass("md:rounded-l-card");
		expect(drawer.parentElement).not.toHaveClass("rounded-l-card");
	});

	test("slides in from the right and the scrim fades", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const drawer = await open(user);

		expect(drawer.parentElement).toHaveClass(
			"entering:translate-x-full",
			"exiting:translate-x-full",
		);
		expect(drawer.parentElement!.parentElement).toHaveClass(
			"entering:opacity-0",
			"exiting:opacity-0",
		);
	});

	test("scrolls as one when its content is tall", async () => {
		const user = userEvent.setup();
		render(<Host />);
		const drawer = await open(user);

		expect(drawer.parentElement).toHaveClass("overflow-y-auto");
		expect(drawer).toHaveClass("min-h-full");
	});

	test("takes the caller's classes on the panel", async () => {
		const user = userEvent.setup();
		render(<Host className="p-5.5" />);
		const drawer = await open(user);

		expect(drawer.parentElement).toHaveClass("p-5.5", "max-w-105");
	});
});
