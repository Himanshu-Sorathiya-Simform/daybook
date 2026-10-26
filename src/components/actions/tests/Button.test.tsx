import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import { Button } from "@/components/actions/Button";

describe("default", () => {
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

	test("shows a decorative icon and the shortcut key", () => {
		render(
			<Button
				icon={Plus}
				shortcut="N"
			>
				Add transaction
			</Button>,
		);

		const button = screen.getByRole("button", { name: /Add transaction/ });
		expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
		expect(button.querySelector("kbd")).toHaveTextContent("N");
	});

	test("puts the caller's classes on the button, after its own", () => {
		render(<Button className="h-12 flex-1">Save</Button>);

		const button = screen.getByRole("button", { name: "Save" });
		expect(button).toHaveClass("flex-1", "h-12");
		expect(button).not.toHaveClass("h-9.5");
	});

	test("submits a form when its type is submit", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn((event: React.SubmitEvent) => event.preventDefault());
		render(
			<form onSubmit={onSubmit}>
				<Button type="submit">Save</Button>
			</form>,
		);

		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(onSubmit).toHaveBeenCalledOnce();
	});
});

describe("disabled", () => {
	test("is announced as disabled but still reachable with Tab", async () => {
		const user = userEvent.setup();
		render(<Button isDisabled>Upgrade</Button>);

		await user.tab();

		const button = screen.getByRole("button", { name: "Upgrade" });
		expect(button).toHaveAttribute("aria-disabled", "true");
		expect(button).toHaveFocus();
	});

	test("ignores clicks, Enter and Space", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		const onClick = vi.fn();
		render(
			<Button
				isDisabled
				onPress={onPress}
				onClick={onClick}
			>
				Upgrade
			</Button>,
		);

		await user.click(screen.getByRole("button", { name: "Upgrade" }));
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(onPress).not.toHaveBeenCalled();
		expect(onClick).not.toHaveBeenCalled();
	});

	test("does not submit a form", async () => {
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
	});

	test("shows the reason under the button and reads it with the button", () => {
		render(
			<Button
				isDisabled
				description="You're offline. Connect to upgrade."
				className="mt-4"
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
		// The caller's classes go on the wrapper, which is the root element.
		expect(button.parentElement).toHaveClass("mt-4");
	});
});

describe("pending", () => {
	test("passes React Aria's pending state through and stops presses", async () => {
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
		await user.click(button);

		expect(button).toHaveAttribute("data-pending", "true");
		expect(onPress).not.toHaveBeenCalled();
	});
});
