import { render, screen } from "@testing-library/react";
import { Clock3 } from "lucide-react";
import { describe, expect, test } from "vitest";

import { FormNote } from "@/components/feedback/FormNote";

describe("FormNote", () => {
	test("says its text politely", () => {
		render(
			<FormNote icon={Clock3}>
				Your session has expired. Log in to continue.
			</FormNote>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"Your session has expired. Log in to continue.",
		);
	});

	test("shows its icon, hidden from screen readers", () => {
		render(<FormNote icon={Clock3}>x</FormNote>);
		const icon = screen.getByRole("status").querySelector("svg");
		expect(icon).toHaveAttribute("aria-hidden", "true");
		expect(icon).toHaveClass("lucide-clock-3");
	});

	test("is a soft box, and takes the caller's classes last", () => {
		render(
			<FormNote
				icon={Clock3}
				className="mb-2"
			>
				x
			</FormNote>,
		);
		expect(screen.getByRole("status")).toHaveClass(
			"bg-soft",
			"rounded-control",
			"mb-2",
		);
	});
});
