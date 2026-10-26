import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChevronLeft, X } from "lucide-react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { IconButton } from "@/components/actions/IconButton";

afterEach(() => {
	vi.useRealTimers();
});

// This comes first on purpose. React Aria keeps tooltips "warm" across the page once one has been
// shown, so a tooltip that an earlier test left open would make this one appear at once.
describe("tooltip timing", () => {
	test("opens on hover after the default half-second, and not before", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		render(
			<IconButton
				icon={X}
				label="Close"
			/>,
		);
		await user.pointer({ target: document.body });

		await user.hover(screen.getByRole("button", { name: "Close" }));
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(600);
		});
		expect(screen.getByRole("tooltip")).toHaveTextContent("Close");
	});
});

describe("default", () => {
	test("is named by its label and has a decorative icon", () => {
		render(
			<IconButton
				icon={ChevronLeft}
				label="Previous month"
			/>,
		);

		const button = screen.getByRole("button", { name: "Previous month" });
		expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
		expect(button).toHaveTextContent("");
	});

	test("is an outline, medium button that does not submit a form", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((event: React.SubmitEvent) => event.preventDefault());
		render(
			<form onSubmit={onSubmit}>
				<IconButton
					icon={X}
					label="Close"
				/>
			</form>,
		);

		const button = screen.getByRole("button", { name: "Close" });
		await user.click(button);

		expect(button).toHaveAttribute("type", "button");
		expect(button).toHaveClass("border-line-strong", "bg-page", "size-9");
		expect(onSubmit).not.toHaveBeenCalled();
	});

	test("submits a form when its type is submit", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((event: React.SubmitEvent) => event.preventDefault());
		render(
			<form onSubmit={onSubmit}>
				<IconButton
					icon={X}
					label="Go"
					type="submit"
				/>
			</form>,
		);

		await user.click(screen.getByRole("button", { name: "Go" }));

		expect(onSubmit).toHaveBeenCalledOnce();
	});

	test("passes id and data attributes through, and can take focus on render", () => {
		render(
			<IconButton
				icon={X}
				label="Close"
				id="close"
				data-testid="close-button"
				autoFocus
			/>,
		);

		expect(screen.getByTestId("close-button")).toHaveAttribute("id", "close");
		expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
	});

	test("puts the caller's classes on the button, after its own", () => {
		render(
			<IconButton
				icon={X}
				label="Close"
				className="ml-auto size-12"
			/>,
		);

		const button = screen.getByRole("button", { name: "Close" });
		expect(button).toHaveClass("ml-auto", "size-12");
		expect(button).not.toHaveClass("size-9");
	});
});

describe("variants and sizes", () => {
	test("outline has a visible edge and a page background", () => {
		render(
			<IconButton
				icon={X}
				label="Close"
				variant="outline"
			/>,
		);

		expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
			"border-line-strong",
			"bg-page",
		);
	});

	test("plain has no edge and no background", () => {
		render(
			<IconButton
				icon={X}
				label="Close"
				variant="plain"
			/>,
		);

		expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
			"border-transparent",
			"bg-transparent",
		);
	});

	test.each([
		["sm", "size-8", "size-3.5"],
		["md", "size-9", "size-4"],
		["lg", "size-11", "size-4.75"],
	] as const)("%s is a %s box with a %s icon", (size, box, icon) => {
		render(
			<IconButton
				icon={X}
				label="Close"
				size={size}
			/>,
		);

		const button = screen.getByRole("button", { name: "Close" });
		expect(button).toHaveClass(box);
		expect(button.querySelector("svg")).toHaveClass(icon);
	});

	test.each(["sm", "md", "lg"] as const)(
		"%s grows to the 44px touch target on phones (D-394)",
		(size) => {
			render(
				<IconButton
					icon={X}
					label="Close"
					size={size}
				/>,
			);

			expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
				"max-md:size-11",
			);
		},
	);
});

describe("pressing", () => {
	test("presses with the mouse, Enter and Space", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(
			<IconButton
				icon={X}
				label="Close"
				onPress={onPress}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Close" }));
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(onPress).toHaveBeenCalledTimes(3);
	});

	test("reports the start and end of a press", async () => {
		const user = userEvent.setup();
		const calls: string[] = [];
		render(
			<IconButton
				icon={X}
				label="Close"
				onPressStart={() => calls.push("start")}
				onPressEnd={() => calls.push("end")}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(calls).toEqual(["start", "end"]);
	});

	test("marks itself hovered and pressed", async () => {
		const user = userEvent.setup();
		render(
			<IconButton
				icon={X}
				label="Close"
			/>,
		);
		const button = screen.getByRole("button", { name: "Close" });

		await user.hover(button);
		expect(button).toHaveAttribute("data-hovered", "true");
		await user.pointer({ keys: "[MouseLeft>]", target: button });
		expect(button).toHaveAttribute("data-pressed", "true");
	});
});

describe("tooltip", () => {
	test("shows the label on keyboard focus, below the button by default", async () => {
		const user = userEvent.setup();
		render(
			<IconButton
				icon={ChevronLeft}
				label="Previous month"
			/>,
		);

		await user.tab();

		const tip = await screen.findByRole("tooltip");
		expect(tip).toHaveTextContent("Previous month");
		expect(tip).toHaveAttribute("data-placement", "bottom");
	});

	test.each(["top", "bottom", "left", "right"] as const)(
		"can open on the %s",
		async (placement) => {
			const user = userEvent.setup();
			render(
				<div className="m-40">
					<IconButton
						icon={X}
						label="Close"
						tooltipPlacement={placement}
					/>
				</div>,
			);

			await user.tab();

			expect(await screen.findByRole("tooltip")).toHaveAttribute(
				"data-placement",
				placement,
			);
		},
	);

	test("describes the button for screen readers while it is open", async () => {
		const user = userEvent.setup();
		render(
			<IconButton
				icon={X}
				label="Close"
			/>,
		);

		await user.tab();
		await screen.findByRole("tooltip");

		expect(
			screen.getByRole("button", { name: "Close" }),
		).toHaveAccessibleDescription("Close");
	});

	test("closes when the button is pressed", async () => {
		const user = userEvent.setup();
		render(
			<IconButton
				icon={X}
				label="Close"
			/>,
		);
		await user.tab();
		await screen.findByRole("tooltip");

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("closes on Escape", async () => {
		const user = userEvent.setup();
		render(
			<IconButton
				icon={X}
				label="Close"
			/>,
		);
		await user.tab();
		await screen.findByRole("tooltip");

		await user.keyboard("{Escape}");

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});
});

describe("disabled", () => {
	test("is announced as disabled, is not natively disabled, and can be reached with Tab", async () => {
		const user = userEvent.setup();
		render(
			<IconButton
				icon={ChevronLeft}
				label="Next month"
				isDisabled
			/>,
		);

		await user.tab();

		const button = screen.getByRole("button", { name: "Next month" });
		expect(button).toHaveAttribute("aria-disabled", "true");
		expect(button).not.toHaveAttribute("disabled");
		expect(button).toHaveFocus();
	});

	test("ignores every kind of press", async () => {
		const user = userEvent.setup();
		const handlers = {
			onPress: vi.fn(),
			onPressStart: vi.fn(),
			onPressEnd: vi.fn(),
			onPressChange: vi.fn(),
			onPressUp: vi.fn(),
		};
		render(
			<IconButton
				icon={X}
				label="Close"
				isDisabled
				{...handlers}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Close" }));
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		for (const handler of Object.values(handlers))
			expect(handler).not.toHaveBeenCalled();
	});

	test("does not submit a form", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((event: React.SubmitEvent) => event.preventDefault());
		render(
			<form onSubmit={onSubmit}>
				<IconButton
					icon={X}
					label="Go"
					type="submit"
					isDisabled
				/>
			</form>,
		);

		await user.click(screen.getByRole("button", { name: "Go" }));

		expect(onSubmit).not.toHaveBeenCalled();
	});

	test("shows its dashed outline instead of fading", () => {
		render(
			<IconButton
				icon={X}
				label="Close"
				isDisabled
			/>,
		);

		expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
			"aria-disabled:border-dashed",
			"aria-disabled:text-ink-3",
		);
	});

	test("keeps keyboard focus when it becomes disabled while focused", async () => {
		const user = userEvent.setup();
		const { rerender } = render(
			<IconButton
				icon={X}
				label="Close"
			/>,
		);
		await user.tab();

		rerender(
			<IconButton
				icon={X}
				label="Close"
				isDisabled
			/>,
		);

		expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
	});

	test("works again once it is enabled", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		const { rerender } = render(
			<IconButton
				icon={X}
				label="Close"
				isDisabled
				onPress={onPress}
			/>,
		);
		rerender(
			<IconButton
				icon={X}
				label="Close"
				onPress={onPress}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(onPress).toHaveBeenCalledOnce();
	});

	test("still shows its label as a tooltip when focused", async () => {
		const user = userEvent.setup();
		render(
			<IconButton
				icon={X}
				label="Close"
				isDisabled
			/>,
		);

		await user.tab();

		expect(await screen.findByRole("tooltip")).toHaveTextContent("Close");
	});
});

describe("pending", () => {
	test("is marked pending and ignores presses", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(
			<IconButton
				icon={X}
				label="Save"
				isPending
				onPress={onPress}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Save/ }));

		expect(screen.getByRole("button", { name: /Save/ })).toHaveAttribute(
			"data-pending",
			"true",
		);
		expect(onPress).not.toHaveBeenCalled();
	});
});
