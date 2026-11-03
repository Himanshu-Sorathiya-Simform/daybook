import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { TextLink } from "@/components/navigation/TextLink";

describe("TextLink", () => {
	test("is a link to its href, named by its text", () => {
		render(<TextLink href="/login">Log in</TextLink>);
		const link = screen.getByRole("link", { name: "Log in" });
		expect(link).toHaveAttribute("href", "/login");
	});

	test("is underlined, so it differs from the text around it by more than colour", () => {
		render(<TextLink href="/login">Log in</TextLink>);
		expect(screen.getByRole("link", { name: "Log in" })).toHaveClass(
			"underline",
			"text-accent",
		);
	});

	test("adds the caller's classes last", () => {
		render(
			<TextLink
				href="/login"
				className="text-label font-normal"
			>
				Log in
			</TextLink>,
		);
		const link = screen.getByRole("link", { name: "Log in" });
		expect(link).toHaveClass("text-label", "font-normal");
		expect(link).not.toHaveClass("font-semibold");
	});

	test("sits inside running text", () => {
		render(
			<p>
				New here? <TextLink href="/signup">Create an account</TextLink>
			</p>,
		);
		expect(screen.getByText(/New here\?/)).toContainElement(
			screen.getByRole("link", { name: "Create an account" }),
		);
	});

	test("is reached with Tab", async () => {
		const user = userEvent.setup();
		render(<TextLink href="/login">Log in</TextLink>);
		await user.tab();
		expect(screen.getByRole("link", { name: "Log in" })).toHaveFocus();
	});
});
