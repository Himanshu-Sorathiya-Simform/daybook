import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { FormAlert } from "@/components/feedback/FormAlert";

describe("FormAlert", () => {
	test("reads its text out at once", () => {
		render(<FormAlert>Email or password is incorrect.</FormAlert>);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Email or password is incorrect.",
		);
	});

	test("is a box on the negative fill with the alert icon, and takes the caller's classes last", () => {
		render(<FormAlert className="mt-2">x</FormAlert>);
		const alert = screen.getByRole("alert");
		expect(alert).toHaveClass("bg-neg-soft", "text-label", "mt-2");
		const icon = alert.querySelector("svg");
		expect(icon).toHaveClass("lucide-circle-alert", "text-neg");
		expect(icon).toHaveAttribute("aria-hidden", "true");
	});

	test("leaves focus alone by default", () => {
		render(<FormAlert>x</FormAlert>);
		expect(screen.getByRole("alert")).not.toHaveFocus();
		expect(screen.getByRole("alert")).not.toHaveAttribute("tabindex");
	});

	test("with takesFocus, takes focus as it shows", () => {
		render(<FormAlert takesFocus>x</FormAlert>);
		expect(screen.getByRole("alert")).toHaveFocus();
		expect(screen.getByRole("alert")).toHaveAttribute("tabindex", "-1");
	});

	test("with takesFocus, takes it again for a new message, not for the same one", () => {
		const { rerender } = render(<FormAlert takesFocus>first</FormAlert>);
		const alert = screen.getByRole("alert");
		alert.blur();
		rerender(<FormAlert takesFocus>first</FormAlert>);
		expect(alert).not.toHaveFocus();
		rerender(<FormAlert takesFocus>second</FormAlert>);
		expect(alert).toHaveFocus();
	});
});
