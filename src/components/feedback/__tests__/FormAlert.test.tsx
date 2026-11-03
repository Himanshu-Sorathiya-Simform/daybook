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

	test("is coloured as a refusal and takes the caller's classes last", () => {
		render(<FormAlert className="mt-2">x</FormAlert>);
		expect(screen.getByRole("alert")).toHaveClass(
			"text-neg",
			"text-label",
			"mt-2",
		);
	});
});
