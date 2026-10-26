import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChevronLeft } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import { IconButton } from "@/components/actions/IconButton";

describe("default", () => {
	test("is named by its label and presses with the mouse and keyboard", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(
			<IconButton
				icon={ChevronLeft}
				label="Previous month"
				onPress={onPress}
			/>,
		);

		const button = screen.getByRole("button", { name: "Previous month" });
		await user.click(button);
		await user.keyboard("{Enter}");

		expect(onPress).toHaveBeenCalledTimes(2);
		expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
	});

	test("shows its label as a tooltip on keyboard focus and hides it on Escape", async () => {
		const user = userEvent.setup();
		render(
			<IconButton
				icon={ChevronLeft}
				label="Previous month"
			/>,
		);

		await user.tab();
		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Previous month",
		);

		await user.keyboard("{Escape}");
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("puts the caller's classes on the button", () => {
		render(
			<IconButton
				icon={ChevronLeft}
				label="Previous month"
				className="ml-auto"
			/>,
		);

		expect(screen.getByRole("button", { name: "Previous month" })).toHaveClass(
			"ml-auto",
		);
	});
});

describe("disabled", () => {
	test("cannot be pressed or focused", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(
			<IconButton
				icon={ChevronLeft}
				label="Next month"
				isDisabled
				onPress={onPress}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Next month" }));
		await user.tab();

		expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
		expect(onPress).not.toHaveBeenCalled();
	});
});
