import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	Button as AriaButton,
	Focusable as AriaFocusable,
} from "react-aria-components";
import { afterEach, describe, expect, test, vi } from "vitest";

import { Tooltip, type TooltipProps } from "@/components/navigation/Tooltip";

afterEach(() => {
	vi.useRealTimers();
});

function renderTooltip(
	props: Partial<Omit<TooltipProps, "children" | "text">> = {},
) {
	return render(
		<div className="m-40">
			<Tooltip
				text="Synced just now"
				delay={0}
				closeDelay={0}
				{...props}
			>
				<AriaButton>Sync</AriaButton>
			</Tooltip>
			<button>Other</button>
		</div>,
	);
}

describe("opening", () => {
	test("is hidden until the trigger is hovered or focused", () => {
		renderTooltip();

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("opens on hover and closes when the pointer leaves", async () => {
		const user = userEvent.setup();
		renderTooltip();

		// React Aria counts a hover only after it has seen the pointer move, so move it first.
		await user.pointer({ target: document.body });
		await user.hover(screen.getByRole("button", { name: "Sync" }));
		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Synced just now",
		);

		await user.unhover(screen.getByRole("button", { name: "Sync" }));
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("opens on keyboard focus and describes the trigger", async () => {
		const user = userEvent.setup();
		renderTooltip();

		await user.tab();

		expect(await screen.findByRole("tooltip")).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Sync" }),
		).toHaveAccessibleDescription("Synced just now");
	});

	test("does not open when the trigger is focused by a mouse click", async () => {
		const user = userEvent.setup();
		renderTooltip();

		await user.click(screen.getByRole("button", { name: "Sync" }));

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("closes when focus moves away", async () => {
		const user = userEvent.setup();
		renderTooltip();
		await user.tab();
		await screen.findByRole("tooltip");

		await user.tab();

		expect(screen.getByRole("button", { name: "Other" })).toHaveFocus();
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("closes on Escape", async () => {
		const user = userEvent.setup();
		renderTooltip();
		await user.tab();
		await screen.findByRole("tooltip");

		await user.keyboard("{Escape}");

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("closes when the trigger is pressed", async () => {
		const user = userEvent.setup();
		renderTooltip();
		await user.tab();
		await screen.findByRole("tooltip");

		await user.keyboard("{Enter}");

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});
});

describe("timing", () => {
	test("waits half a second before opening on hover by default", async () => {
		// React Aria keeps tooltips "warm" for half a second after one closes, so wait that out.
		await new Promise((resolve) => setTimeout(resolve, 600));
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(
			<Tooltip text="Synced just now">
				<AriaButton>Sync</AriaButton>
			</Tooltip>,
		);
		await user.pointer({ target: document.body });

		await user.hover(screen.getByRole("button", { name: "Sync" }));
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(600);
		});
		expect(screen.getByRole("tooltip")).toBeVisible();
	});

	test("opens at once on keyboard focus, whatever the delay", async () => {
		const user = userEvent.setup();
		render(
			<Tooltip
				text="Synced just now"
				delay={5000}
			>
				<AriaButton>Sync</AriaButton>
			</Tooltip>,
		);

		await user.tab();

		expect(await screen.findByRole("tooltip")).toBeVisible();
	});

	test("opens at once on hover when the delay is 0", async () => {
		const user = userEvent.setup();
		renderTooltip();
		await user.pointer({ target: document.body });

		await user.hover(screen.getByRole("button", { name: "Sync" }));

		expect(await screen.findByRole("tooltip")).toBeVisible();
	});

	test("stays open for the close delay after the pointer leaves", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderTooltip({ delay: 0, closeDelay: 400 });
		await user.pointer({ target: document.body });
		await user.hover(screen.getByRole("button", { name: "Sync" }));
		await screen.findByRole("tooltip");

		await user.unhover(screen.getByRole("button", { name: "Sync" }));
		expect(screen.getByRole("tooltip")).toBeVisible();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(500);
		});
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});
});

describe("placement", () => {
	test("opens below by default", async () => {
		const user = userEvent.setup();
		renderTooltip();

		await user.tab();

		expect(await screen.findByRole("tooltip")).toHaveAttribute(
			"data-placement",
			"bottom",
		);
	});

	test.each(["top", "bottom", "left", "right"] as const)(
		"can open on the %s",
		async (placement) => {
			const user = userEvent.setup();
			renderTooltip({ placement });

			await user.tab();

			expect(await screen.findByRole("tooltip")).toHaveAttribute(
				"data-placement",
				placement,
			);
		},
	);
});

describe("styling", () => {
	test("is the inverse surface with small medium text", async () => {
		const user = userEvent.setup();
		renderTooltip();

		await user.tab();

		expect(await screen.findByRole("tooltip")).toHaveClass(
			"bg-ink",
			"text-page",
			"text-small",
			"font-medium",
		);
	});

	test("takes the caller's classes for the bubble", async () => {
		const user = userEvent.setup();
		renderTooltip({ className: "max-w-48" });

		await user.tab();

		expect(await screen.findByRole("tooltip")).toHaveClass("max-w-48");
	});

	test("fades in and out through React Aria's entering and exiting states", async () => {
		const user = userEvent.setup();
		renderTooltip();

		await user.tab();

		expect(await screen.findByRole("tooltip")).toHaveClass(
			"entering:opacity-0",
			"exiting:opacity-0",
			"transition-opacity",
		);
	});
});

describe("disabled", () => {
	test("never opens, on focus or hover", async () => {
		const user = userEvent.setup();
		renderTooltip({ isDisabled: true });

		await user.tab();
		await user.pointer({ target: document.body });
		await user.hover(screen.getByRole("button", { name: "Sync" }));

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});
});

describe("other triggers", () => {
	test("describes content that is not a button when it is made focusable", async () => {
		const user = userEvent.setup();
		render(
			<Tooltip
				text="Premium, renews 12 Mar 2027"
				delay={0}
			>
				<AriaFocusable>
					<span tabIndex={0}>Premium</span>
				</AriaFocusable>
			</Tooltip>,
		);

		await user.tab();

		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Premium, renews 12 Mar 2027",
		);
		expect(screen.getByText("Premium")).toHaveAttribute("aria-describedby");
	});

	test("shows one tooltip at a time", async () => {
		const user = userEvent.setup();
		render(
			<>
				<Tooltip
					text="First tip"
					delay={0}
					closeDelay={0}
				>
					<AriaButton>One</AriaButton>
				</Tooltip>
				<Tooltip
					text="Second tip"
					delay={0}
					closeDelay={0}
				>
					<AriaButton>Two</AriaButton>
				</Tooltip>
			</>,
		);

		await user.tab();
		await screen.findByText("First tip");
		await user.tab();

		expect(await screen.findByText("Second tip")).toBeVisible();
		expect(screen.queryByText("First tip")).not.toBeInTheDocument();
		expect(screen.getAllByRole("tooltip")).toHaveLength(1);
	});
});
