import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	FilterPopover,
	type FilterPopoverProps,
} from "@/components/forms/FilterPopover";

type User = ReturnType<typeof userEvent.setup>;

function renderPopover(props: Partial<FilterPopoverProps> = {}) {
	const user = userEvent.setup();
	const view = render(
		<>
			<button type="button">Outside</button>
			<FilterPopover
				label="Date"
				{...props}
			>
				{props.children ?? (
					<>
						<button type="button">This month</button>
						<button type="button">Last month</button>
					</>
				)}
			</FilterPopover>
		</>,
	);
	return { ...view, user };
}

// While the popover is open React Aria hides the rest of the page from screen readers, the
// trigger included, so the trigger is found among hidden elements too.
const trigger = (name: string | RegExp = /^Date/) =>
	screen.getByRole("button", { name, hidden: true });

const focusBack = () => waitFor(() => expect(trigger()).toHaveFocus());

async function open(user: User, name: string | RegExp = /^Date/) {
	await user.click(trigger(name));
	return screen.findByRole("dialog", { name: "Date" });
}

const closed = () =>
	waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("trigger", () => {
	test("is named by the label alone when there is no value", () => {
		renderPopover();

		expect(trigger("Date")).toBeInTheDocument();
	});

	test("is named by the label and the value, kept apart by a space", () => {
		renderPopover({ value: "Last month" });

		expect(trigger("Date Last month")).toBeInTheDocument();
		expect(screen.getByText("Last month", { selector: "span" })).toHaveClass(
			"font-semibold",
		);
	});

	test("shows the label in the second ink, before the value", () => {
		renderPopover({ value: "Any" });

		const [label, value] = Array.from(trigger().querySelectorAll("span"));
		expect(label).toHaveTextContent("Date");
		expect(label).toHaveClass("text-ink-2");
		expect(value).toHaveTextContent("Any");
	});

	test("is closed at first", () => {
		renderPopover();

		expect(trigger()).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("hides its chevron from screen readers", () => {
		renderPopover();

		expect(trigger().querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	test("has the plain edge while the filter is not active", () => {
		renderPopover();

		expect(trigger()).toHaveClass("border-edge");
		expect(trigger()).not.toHaveClass("border-accent");
	});

	test("takes the accent outline while the filter is active, with the value saying which", () => {
		renderPopover({ isActive: true, value: "Last month" });

		expect(trigger()).toHaveClass("border-accent", "border-[1.5px]");
		expect(trigger()).not.toHaveClass("border-edge");
	});

	test("is 44px tall on phones", () => {
		renderPopover();

		expect(trigger()).toHaveClass("h-9.5", "max-md:min-h-11");
	});

	test("takes the caller's classes", () => {
		renderPopover({ className: "ml-auto" });

		expect(trigger()).toHaveClass("ml-auto");
	});
});

describe("opening", () => {
	test("a press opens a dialog named by the label, and the trigger says it is open", async () => {
		const { user } = renderPopover({ value: "Any" });

		const dialog = await open(user);

		expect(dialog).toBeVisible();
		expect(trigger()).toHaveAttribute("aria-expanded", "true");
		expect(trigger()).toHaveClass("aria-expanded:bg-accent-soft");
	});

	test.each(["{Enter}", " "])("%j on the trigger opens it", async (key) => {
		const { user } = renderPopover();
		trigger().focus();

		await user.keyboard(key);

		expect(await screen.findByRole("dialog", { name: "Date" })).toBeVisible();
	});

	test("moves focus into the popover", async () => {
		const { user } = renderPopover();

		const dialog = await open(user);

		await waitFor(() =>
			expect(dialog).toContainElement(document.activeElement as HTMLElement),
		);
	});

	test("shows the content", async () => {
		const { user } = renderPopover();

		const dialog = await open(user);

		expect(
			within(dialog).getByRole("button", { name: "Last month" }),
		).toBeVisible();
	});

	test("can be open from the start", async () => {
		renderPopover({ defaultOpen: true });

		expect(await screen.findByRole("dialog", { name: "Date" })).toBeVisible();
	});

	test("a second press on the trigger closes it", async () => {
		const { user } = renderPopover();
		await open(user);

		await user.click(trigger());

		await closed();
	});
});

describe("closing", () => {
	test("Escape closes it and puts focus back on the trigger", async () => {
		const { user } = renderPopover();
		await open(user);

		await user.keyboard("{Escape}");

		await closed();
		await focusBack();
		expect(trigger()).toHaveAttribute("aria-expanded", "false");
	});

	test("a press outside closes it", async () => {
		const { user } = renderPopover();
		await open(user);

		await user.click(document.body);

		await closed();
	});

	test("a press inside keeps it open", async () => {
		const { user } = renderPopover();
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("button", { name: "This month" }));

		expect(screen.getByRole("dialog", { name: "Date" })).toBeVisible();
	});

	test("can be opened again after it closed", async () => {
		const { user } = renderPopover();
		await open(user);
		await user.keyboard("{Escape}");
		await closed();

		expect(await open(user)).toBeVisible();
	});
});

describe("focus inside", () => {
	test("Tab stays inside the popover", async () => {
		const { user } = renderPopover();
		const dialog = await open(user);

		for (let i = 0; i < 5; i++) {
			await user.tab();
			expect(dialog).toContainElement(document.activeElement as HTMLElement);
		}
	});

	test("Shift+Tab stays inside the popover", async () => {
		const { user } = renderPopover();
		const dialog = await open(user);

		for (let i = 0; i < 5; i++) {
			await user.tab({ shift: true });
			expect(dialog).toContainElement(document.activeElement as HTMLElement);
		}
	});
});

describe("content as a function", () => {
	test("gets close, so a choice can close the popover", async () => {
		const pick = vi.fn();
		const { user } = renderPopover({
			children: (close) => (
				<button
					type="button"
					onClick={() => {
						pick("last");
						close();
					}}
				>
					Last month
				</button>
			),
		});
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("button", { name: "Last month" }));

		expect(pick).toHaveBeenCalledExactlyOnceWith("last");
		await closed();
		await focusBack();
	});

	test("is rendered only while open", async () => {
		const content = vi.fn(() => <p>Choices</p>);
		const { user } = renderPopover({ children: content });

		expect(content).not.toHaveBeenCalled();
		await open(user);
		expect(screen.getByText("Choices")).toBeVisible();
	});
});

describe("footer", () => {
	test("has no footer row without a footer or Done", async () => {
		const { user } = renderPopover();
		const dialog = await open(user);

		expect(dialog.querySelector(".border-t")).toBeNull();
		expect(within(dialog).queryByRole("button", { name: "Done" })).toBeNull();
	});

	test("shows the footer in a row under the content, with no Done", async () => {
		const { user } = renderPopover({
			footer: <span>16 days · 23 Transactions</span>,
		});
		const dialog = await open(user);

		const row = within(dialog).getByText("16 days · 23 Transactions")
			.parentElement!.parentElement!;
		expect(row).toHaveClass("border-t", "border-line");
		expect(row).toBe(dialog.lastElementChild);
		expect(within(dialog).queryByRole("button", { name: "Done" })).toBeNull();
	});

	test("Done closes the popover and puts focus back on the trigger", async () => {
		const { user } = renderPopover({ showDone: true });
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("button", { name: "Done" }));

		await closed();
		await focusBack();
	});

	test("Done can be reached and pressed with the keyboard", async () => {
		const { user } = renderPopover({ showDone: true });
		const dialog = await open(user);
		const done = within(dialog).getByRole("button", { name: "Done" });

		while (document.activeElement !== done) await user.tab();
		await user.keyboard("{Enter}");

		await closed();
	});

	test("Done sits at the end of the row, after the footer", async () => {
		const { user } = renderPopover({
			showDone: true,
			footer: <button type="button">Clear</button>,
		});
		const dialog = await open(user);

		const row = dialog.lastElementChild!;
		expect(row.firstElementChild).toHaveTextContent("Clear");
		expect(row.lastElementChild).toHaveTextContent("Done");
		expect(row.firstElementChild).toHaveClass("flex-1");
	});

	test("a button in the footer works without closing the popover", async () => {
		const clear = vi.fn();
		const { user } = renderPopover({
			footer: (
				<button
					type="button"
					onClick={clear}
				>
					Clear
				</button>
			),
		});
		const dialog = await open(user);

		await user.click(within(dialog).getByRole("button", { name: "Clear" }));

		expect(clear).toHaveBeenCalledOnce();
		expect(screen.getByRole("dialog")).toBeVisible();
	});
});

describe("controlled", () => {
	function Controlled({
		onOpenChange,
	}: {
		onOpenChange: (open: boolean) => void;
	}) {
		const [isOpen, setOpen] = useState(false);
		return (
			<>
				<button
					type="button"
					onClick={() => setOpen(true)}
				>
					Open from outside
				</button>
				<FilterPopover
					label="Date"
					isOpen={isOpen}
					onOpenChange={(next) => {
						setOpen(next);
						onOpenChange(next);
					}}
				>
					<p>Choices</p>
				</FilterPopover>
			</>
		);
	}

	test("reports opening and closing", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<Controlled onOpenChange={onOpenChange} />);

		await user.click(screen.getByRole("button", { name: "Date" }));
		expect(onOpenChange).toHaveBeenLastCalledWith(true);
		await screen.findByRole("dialog");

		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
		await closed();
	});

	test("opens when the parent sets isOpen", async () => {
		const user = userEvent.setup();
		render(<Controlled onOpenChange={() => {}} />);

		await user.click(screen.getByRole("button", { name: "Open from outside" }));

		expect(await screen.findByRole("dialog", { name: "Date" })).toBeVisible();
	});

	test("stays open while the parent keeps isOpen", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(
			<FilterPopover
				label="Date"
				isOpen
				onOpenChange={onOpenChange}
			>
				<p>Choices</p>
			</FilterPopover>,
		);
		await screen.findByRole("dialog");

		await user.keyboard("{Escape}");

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(screen.getByRole("dialog", { name: "Date" })).toBeVisible();
	});
});

describe("popover", () => {
	test.each([
		["sm", "w-60"],
		["md", "w-72"],
		["lg", "w-90"],
		["xl", "w-130"],
	] as const)(
		"width %s is %s, never wider than the screen",
		async (width, cls) => {
			const { user } = renderPopover({ width });
			const dialog = await open(user);

			expect(dialog.parentElement).toHaveClass(
				cls,
				"max-w-[calc(100vw-2rem)]",
			);
		},
	);

	test("is medium by default", async () => {
		const { user } = renderPopover();
		const dialog = await open(user);

		expect(dialog.parentElement).toHaveClass("w-72");
	});

	test("scrolls when its content is taller than the room", async () => {
		const { user } = renderPopover();
		const dialog = await open(user);

		expect(dialog.parentElement).toHaveClass("overflow-auto");
	});

	// jsdom lays nothing out, so the trigger is given a box from 500 to 600px; the popover,
	// which jsdom sizes at zero, then starts at the trigger's left or right edge.
	test.each([
		[undefined, "500px"],
		["start", "500px"],
		["end", "600px"],
	] as const)(
		"align %s lines it up at left %s, below the trigger",
		async (align, left) => {
			const { user } = renderPopover(align ? { align } : {});
			trigger().getBoundingClientRect = () =>
				({
					x: 500,
					y: 100,
					left: 500,
					top: 100,
					right: 600,
					bottom: 138,
					width: 100,
					height: 38,
				}) as DOMRect;

			const dialog = await open(user);

			expect(dialog.parentElement).toHaveAttribute("data-placement", "bottom");
			expect(dialog.parentElement).toHaveStyle({ left, top: "144px" });
		},
	);
});
