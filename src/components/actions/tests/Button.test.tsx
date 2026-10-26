import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import { Button, type ButtonProps } from "@/components/actions/Button";

describe("default", () => {
	test("is a primary, medium button that does not submit a form", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((event: React.SubmitEvent) => event.preventDefault());
		render(
			<form onSubmit={onSubmit}>
				<Button>Save</Button>
			</form>,
		);

		const button = screen.getByRole("button", { name: "Save" });
		await user.click(button);

		expect(button).toHaveAttribute("type", "button");
		expect(button).toHaveClass("bg-accent", "text-on-accent", "h-9.5");
		expect(onSubmit).not.toHaveBeenCalled();
	});

	test("passes id, name, value and data attributes to the button", () => {
		render(
			<Button
				id="save"
				name="intent"
				value="save"
				data-testid="the-button"
			>
				Save
			</Button>,
		);

		const button = screen.getByTestId("the-button");
		expect(button).toHaveAttribute("id", "save");
		expect(button).toHaveAttribute("name", "intent");
		expect(button).toHaveAttribute("value", "save");
	});

	test("can take focus on render", () => {
		render(<Button autoFocus>Save</Button>);

		expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
	});

	test("can be left out of the tab order", async () => {
		const user = userEvent.setup();
		render(
			<>
				<Button excludeFromTabOrder>Skip me</Button>
				<Button>Reach me</Button>
			</>,
		);

		await user.tab();

		expect(screen.getByRole("button", { name: "Reach me" })).toHaveFocus();
	});

	test("shows rich children", () => {
		render(
			<Button>
				Add <strong>transaction</strong>
			</Button>,
		);

		expect(
			screen.getByRole("button", { name: "Add transaction" }),
		).toBeVisible();
	});
});

describe("variants", () => {
	test.each([
		["primary", ["bg-accent", "text-on-accent", "border-transparent"]],
		["secondary", ["bg-page", "text-ink", "border-line-strong"]],
		["ghost", ["bg-transparent", "text-accent", "border-transparent"]],
		["danger", ["bg-page", "text-neg", "border-neg"]],
	] as [NonNullable<ButtonProps["variant"]>, string[]][])(
		"%s has its own colours",
		(variant, classes) => {
			render(<Button variant={variant}>Go</Button>);

			expect(screen.getByRole("button", { name: "Go" })).toHaveClass(
				...classes,
			);
		},
	);

	test.each(["primary", "secondary", "ghost", "danger"] as const)(
		"a disabled %s button drops its colours for the dashed outline and grey text",
		(variant) => {
			render(
				<Button
					variant={variant}
					isDisabled
				>
					Go
				</Button>,
			);

			expect(screen.getByRole("button", { name: "Go" })).toHaveClass(
				"aria-disabled:border-dashed",
				"aria-disabled:text-ink-3",
				"aria-disabled:bg-transparent",
				"aria-disabled:cursor-not-allowed",
			);
		},
	);
});

describe("sizes", () => {
	test.each([
		["sm", "h-8", "text-caption"],
		["md", "h-9.5", "text-label"],
		["lg", "h-11", "text-body"],
	] as const)("%s is %s tall", (size, height, text) => {
		render(<Button size={size}>Go</Button>);

		expect(screen.getByRole("button", { name: "Go" })).toHaveClass(height, text);
	});

	test.each(["sm", "md", "lg"] as const)(
		"%s grows to the 44px touch target on phones (D-394)",
		(size) => {
			render(<Button size={size}>Go</Button>);

			expect(screen.getByRole("button", { name: "Go" })).toHaveClass(
				"max-md:min-h-11",
			);
		},
	);
});

describe("icon and shortcut", () => {
	test("shows a decorative icon before the label", () => {
		render(<Button icon={Plus}>Add</Button>);

		const button = screen.getByRole("button", { name: "Add" });
		expect(button.firstElementChild?.tagName.toLowerCase()).toBe("svg");
		expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
	});

	test("has no icon unless one is given", () => {
		render(<Button>Add</Button>);

		expect(
			screen.getByRole("button", { name: "Add" }).querySelector("svg"),
		).toBeNull();
	});

	test("shows the shortcut as a key cap after the label and trims the right padding", () => {
		render(<Button shortcut="N">Add transaction</Button>);

		const button = screen.getByRole("button", { name: /Add transaction/ });
		expect(button.lastElementChild?.tagName.toLowerCase()).toBe("kbd");
		expect(button.lastElementChild).toHaveTextContent("N");
		expect(button).toHaveClass("pr-2");
	});

	test("only displays the shortcut: pressing the key does nothing", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(
			<Button
				shortcut="N"
				onPress={onPress}
			>
				Add
			</Button>,
		);

		await user.keyboard("n");

		expect(onPress).not.toHaveBeenCalled();
	});

	test("has no key cap without a shortcut", () => {
		render(<Button>Add</Button>);

		expect(document.querySelector("kbd")).toBeNull();
	});
});

describe("className", () => {
	test("goes on the button after its own classes, so the caller wins", () => {
		render(<Button className="bg-soft h-12 flex-1">Save</Button>);

		const button = screen.getByRole("button", { name: "Save" });
		expect(button).toHaveClass("flex-1", "h-12");
		expect(button).not.toHaveClass("h-9.5");
	});

	test("goes on the wrapper, not the button, when there is a description", () => {
		render(
			<Button
				className="mt-4"
				description="Why"
			>
				Save
			</Button>,
		);

		const button = screen.getByRole("button", { name: "Save" });
		expect(button.parentElement).toHaveClass("mt-4");
		expect(button).not.toHaveClass("mt-4");
	});
});

describe("pressing", () => {
	test("presses with the mouse, Enter and Space", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(<Button onPress={onPress}>Save</Button>);

		await user.click(screen.getByRole("button", { name: "Save" }));
		screen.getByRole("button", { name: "Save" }).focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(onPress).toHaveBeenCalledTimes(3);
	});

	test("tells onPress how it was pressed", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(<Button onPress={onPress}>Save</Button>);

		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(onPress.mock.calls[0]?.[0]).toMatchObject({ pointerType: "mouse" });

		await user.keyboard("{Enter}");
		expect(onPress.mock.calls[1]?.[0]).toMatchObject({
			pointerType: "keyboard",
		});
	});

	test("reports the start, change, up and end of a press in order", async () => {
		const user = userEvent.setup();
		const calls: string[] = [];
		render(
			<Button
				onPressStart={() => calls.push("start")}
				onPressChange={(pressed) => calls.push(`change:${pressed}`)}
				onPressUp={() => calls.push("up")}
				onPressEnd={() => calls.push("end")}
				onPress={() => calls.push("press")}
			>
				Save
			</Button>,
		);

		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(calls).toEqual([
			"start",
			"change:true",
			"up",
			"end",
			"change:false",
			"press",
		]);
	});

	test("does not press when the pointer leaves before release", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(
			<>
				<Button onPress={onPress}>Save</Button>
				<p>elsewhere</p>
			</>,
		);

		await user.pointer([
			{
				keys: "[MouseLeft>]",
				target: screen.getByRole("button", { name: "Save" }),
			},
			{ target: screen.getByText("elsewhere") },
			{ keys: "[/MouseLeft]" },
		]);

		expect(onPress).not.toHaveBeenCalled();
	});

	test("marks itself hovered and pressed while the pointer is over and down", async () => {
		const user = userEvent.setup();
		render(<Button>Save</Button>);
		const button = screen.getByRole("button", { name: "Save" });

		await user.hover(button);
		expect(button).toHaveAttribute("data-hovered", "true");

		await user.pointer({ keys: "[MouseLeft>]", target: button });
		expect(button).toHaveAttribute("data-pressed", "true");

		await user.pointer({ keys: "[/MouseLeft]" });
		expect(button).not.toHaveAttribute("data-pressed");
	});

	test("shows keyboard focus with data-focus-visible, and not after a mouse click", async () => {
		const user = userEvent.setup();
		render(<Button>Save</Button>);
		const button = screen.getByRole("button", { name: "Save" });

		await user.tab();
		expect(button).toHaveAttribute("data-focus-visible", "true");

		button.blur();
		await user.click(button);
		expect(button).not.toHaveAttribute("data-focus-visible");
	});
});

describe("in a form", () => {
	test("submits when its type is submit, by click and by Enter", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((event: React.SubmitEvent) => event.preventDefault());
		render(
			<form onSubmit={onSubmit}>
				<Button type="submit">Save</Button>
			</form>,
		);

		await user.click(screen.getByRole("button", { name: "Save" }));
		await user.keyboard("{Enter}");

		expect(onSubmit).toHaveBeenCalledTimes(2);
	});

	test("resets the form when its type is reset", async () => {
		const user = userEvent.setup();
		render(
			<form>
				<input
					aria-label="Payee"
					defaultValue="Chai"
				/>
				<Button type="reset">Reset</Button>
			</form>,
		);
		await user.type(screen.getByRole("textbox", { name: "Payee" }), " Point");

		await user.click(screen.getByRole("button", { name: "Reset" }));

		expect(screen.getByRole("textbox", { name: "Payee" })).toHaveValue("Chai");
	});
});

describe("disabled", () => {
	test("is announced as disabled, is not natively disabled, and keeps its place in the tab order", async () => {
		const user = userEvent.setup();
		render(<Button isDisabled>Upgrade</Button>);

		await user.tab();

		const button = screen.getByRole("button", { name: "Upgrade" });
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
			onClick: vi.fn(),
		};
		render(
			<Button
				isDisabled
				{...handlers}
			>
				Upgrade
			</Button>,
		);
		const button = screen.getByRole("button", { name: "Upgrade" });

		await user.click(button);
		button.focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		fireEvent.click(button);

		for (const handler of Object.values(handlers))
			expect(handler).not.toHaveBeenCalled();
	});

	test("does not submit a form, even when its type is submit", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((event: React.SubmitEvent) => event.preventDefault());
		render(
			<form onSubmit={onSubmit}>
				<Button
					type="submit"
					isDisabled
				>
					Save
				</Button>
			</form>,
		);

		await user.click(screen.getByRole("button", { name: "Save" }));
		await user.keyboard("{Enter}");

		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
			"type",
			"button",
		);
	});

	test("works again as soon as it is enabled", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		const { rerender } = render(
			<Button
				isDisabled
				onPress={onPress}
			>
				Save
			</Button>,
		);
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(onPress).not.toHaveBeenCalled();

		rerender(
			<Button
				isDisabled={false}
				onPress={onPress}
			>
				Save
			</Button>,
		);
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(onPress).toHaveBeenCalledOnce();
		expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute(
			"aria-disabled",
		);
	});

	test("stays focused if it becomes disabled while focused", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<Button>Save</Button>);
		await user.tab();

		rerender(<Button isDisabled>Save</Button>);

		expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
	});

	test("with an icon and a shortcut still shows both", () => {
		render(
			<Button
				isDisabled
				icon={Plus}
				shortcut="N"
			>
				Add
			</Button>,
		);

		const button = screen.getByRole("button", { name: /Add/ });
		expect(button.querySelector("svg")).toBeInTheDocument();
		expect(button.querySelector("kbd")).toBeInTheDocument();
	});
});

describe("description", () => {
	test("is shown under the button and read with it", () => {
		render(
			<Button
				isDisabled
				description="You're offline. Connect to upgrade."
			>
				Connect to upgrade
			</Button>,
		);

		const button = screen.getByRole("button", { name: "Connect to upgrade" });
		expect(
			screen.getByText("You're offline. Connect to upgrade."),
		).toBeVisible();
		expect(button).toHaveAccessibleDescription(
			"You're offline. Connect to upgrade.",
		);
	});

	test("is also allowed on an enabled button", () => {
		render(<Button description="Saves a draft.">Save</Button>);

		expect(
			screen.getByRole("button", { name: "Save" }),
		).toHaveAccessibleDescription("Saves a draft.");
	});

	test("is read together with a description the caller names", () => {
		render(
			<>
				<p id="extra">Extra help.</p>
				<Button
					description="Saves a draft."
					aria-describedby="extra"
				>
					Save
				</Button>
			</>,
		);

		expect(
			screen.getByRole("button", { name: "Save" }),
		).toHaveAccessibleDescription("Saves a draft. Extra help.");
	});

	test("without a description keeps the description the caller names", () => {
		render(
			<>
				<p id="extra">Extra help.</p>
				<Button aria-describedby="extra">Save</Button>
			</>,
		);

		expect(
			screen.getByRole("button", { name: "Save" }),
		).toHaveAccessibleDescription("Extra help.");
	});

	test("has no wrapper and no description element without one", () => {
		const { container } = render(<Button>Save</Button>);

		expect(container.firstElementChild?.tagName.toLowerCase()).toBe("button");
		expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute(
			"aria-describedby",
		);
	});

	test("a disabled button's description stays readable when the button has focus", async () => {
		const user = userEvent.setup();
		render(
			<Button
				isDisabled
				description="You're offline."
			>
				Connect to upgrade
			</Button>,
		);

		await user.tab();

		expect(
			screen.getByRole("button", { name: "Connect to upgrade" }),
		).toHaveFocus();
		expect(screen.getByRole("button")).toHaveAccessibleDescription(
			"You're offline.",
		);
	});
});

describe("pending", () => {
	test("is marked pending, stays focusable and ignores presses", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(
			<Button
				isPending
				onPress={onPress}
			>
				Save
			</Button>,
		);

		const button = screen.getByRole("button", { name: /Save/ });
		await user.tab();
		await user.click(button);

		expect(button).toHaveAttribute("data-pending", "true");
		expect(button).toHaveFocus();
		expect(onPress).not.toHaveBeenCalled();
	});

	test("presses normally again when it stops being pending", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		const { rerender } = render(
			<Button
				isPending
				onPress={onPress}
			>
				Save
			</Button>,
		);

		rerender(
			<Button
				isPending={false}
				onPress={onPress}
			>
				Save
			</Button>,
		);
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(onPress).toHaveBeenCalledOnce();
	});
});
