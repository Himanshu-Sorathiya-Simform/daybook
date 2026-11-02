import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { ButtonLink } from "@/components/actions/ButtonLink";
import { buttonClasses } from "@/components/actions/Button";

describe("ButtonLink", () => {
	test("is a link to its href, named by its text", () => {
		render(<ButtonLink href="/signup">Sign up</ButtonLink>);
		const link = screen.getByRole("link", { name: "Sign up" });
		expect(link).toHaveAttribute("href", "/signup");
		expect(link.tagName).toBe("A");
	});

	test("looks like a primary medium button by default", () => {
		render(<ButtonLink href="/signup">Sign up</ButtonLink>);
		const link = screen.getByRole("link", { name: "Sign up" });
		for (const name of buttonClasses({ variant: "primary", size: "md" }).split(
			" ",
		)) {
			expect(link).toHaveClass(name);
		}
	});

	test.each([
		["secondary", "lg"],
		["ghost", "sm"],
		["danger", "md"],
	] as const)("takes the %s %s look", (variant, size) => {
		render(
			<ButtonLink
				href="/login"
				variant={variant}
				size={size}
			>
				Log in
			</ButtonLink>,
		);
		const link = screen.getByRole("link", { name: "Log in" });
		for (const name of buttonClasses({ variant, size }).split(" ")) {
			expect(link).toHaveClass(name);
		}
	});

	test("adds the caller's classes last, so they win", () => {
		render(
			<ButtonLink
				href="/login"
				className="w-full px-8"
			>
				Log in
			</ButtonLink>,
		);
		const link = screen.getByRole("link", { name: "Log in" });
		expect(link).toHaveClass("w-full", "px-8");
		expect(link).not.toHaveClass("px-3.5");
	});

	test("passes link attributes through", () => {
		render(
			<ButtonLink
				href="https://example.com"
				target="_blank"
				rel="noreferrer"
			>
				Docs
			</ButtonLink>,
		);
		const link = screen.getByRole("link", { name: "Docs" });
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noreferrer");
	});

	test("is reached with Tab", async () => {
		const user = userEvent.setup();
		render(<ButtonLink href="/signup">Sign up</ButtonLink>);
		await user.tab();
		expect(screen.getByRole("link", { name: "Sign up" })).toHaveFocus();
	});
});
