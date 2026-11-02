import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { PasswordInput } from "@/components/forms/PasswordInput";

const input = () => screen.getByLabelText("Password", { selector: "input" });

function Controlled() {
	const [value, setValue] = useState("");
	return (
		<PasswordInput
			label="Password"
			autoComplete="new-password"
			value={value}
			onChange={setValue}
		/>
	);
}

describe("PasswordInput", () => {
	test("hides what is typed, with a Show password button", () => {
		render(
			<PasswordInput
				label="Password"
				autoComplete="current-password"
			/>,
		);
		expect(input()).toHaveAttribute("type", "password");
		expect(
			screen.getByRole("button", { name: "Show password" }),
		).toBeInTheDocument();
	});

	test.each(["current-password", "new-password"] as const)(
		"tells password managers it is a %s",
		(autoComplete) => {
			render(
				<PasswordInput
					label="Password"
					autoComplete={autoComplete}
				/>,
			);
			expect(input()).toHaveAttribute("autocomplete", autoComplete);
		},
	);

	test("Show password shows it as text and becomes Hide password; again hides it", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "correct horse");
		await user.click(screen.getByRole("button", { name: "Show password" }));
		expect(input()).toHaveAttribute("type", "text");
		expect(input()).toHaveValue("correct horse");
		await user.click(screen.getByRole("button", { name: "Hide password" }));
		expect(input()).toHaveAttribute("type", "password");
		expect(input()).toHaveValue("correct horse");
	});

	test("the button works from the keyboard", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.tab();
		expect(input()).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
		await user.keyboard("{Enter}");
		expect(input()).toHaveAttribute("type", "text");
		await user.keyboard(" ");
		expect(input()).toHaveAttribute("type", "password");
	});

	test("allows pasting (F01 section 3)", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.click(input());
		await user.paste("pasted from a manager");
		expect(input()).toHaveValue("pasted from a manager");
	});

	test("shows its error and is marked invalid", () => {
		render(
			<PasswordInput
				label="Password"
				autoComplete="new-password"
				error="Use at least 12 characters."
			/>,
		);
		expect(input()).toHaveAttribute("aria-invalid", "true");
		expect(input()).toHaveAccessibleDescription("Use at least 12 characters.");
	});

	test("disabled, both the box and its button are disabled", async () => {
		const user = userEvent.setup();
		render(
			<PasswordInput
				label="Password"
				autoComplete="new-password"
				isDisabled
			/>,
		);
		expect(input()).toBeDisabled();
		const button = screen.getByRole("button", { name: "Show password" });
		expect(button).toHaveAttribute("aria-disabled", "true");
		await user.click(button);
		expect(input()).toHaveAttribute("type", "password");
	});

	test("passes its name and change handler on", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<PasswordInput
				label="Password"
				name="password"
				autoComplete="new-password"
				onChange={onChange}
			/>,
		);
		await user.type(input(), "ab");
		expect(input()).toHaveAttribute("name", "password");
		expect(onChange).toHaveBeenLastCalledWith("ab");
	});
});
