import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Skeleton } from "@/components/feedback/Skeleton";

describe("Skeleton", () => {
	test("is hidden from screen readers and has no text", () => {
		const { container } = render(<Skeleton />);

		expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
		expect(container).toHaveTextContent("");
	});

	test("is not found by role, so it never adds noise to the page", () => {
		render(<Skeleton />);

		expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	test("is a full-width line of body text by default, in the track colour", () => {
		const { container } = render(<Skeleton />);

		expect(container.firstElementChild).toHaveClass(
			"block",
			"h-3.5",
			"w-full",
			"rounded-md",
			"bg-track",
		);
	});

	test("is a span, so it can sit inside a line of text", () => {
		const { container } = render(<Skeleton />);

		expect(container.firstElementChild?.tagName).toBe("SPAN");
	});

	test("takes its size from the caller's classes, which win over the default line", () => {
		const { container } = render(<Skeleton className="h-15 w-45" />);

		expect(container.firstElementChild).toHaveClass("h-15", "w-45", "bg-track");
		expect(container.firstElementChild).not.toHaveClass("h-3.5", "w-full");
	});

	test("takes a different radius from the caller, such as a round avatar or a bar", () => {
		const { container, rerender } = render(
			<Skeleton className="size-9 rounded-full" />,
		);
		expect(container.firstElementChild).toHaveClass("rounded-full");
		expect(container.firstElementChild).not.toHaveClass("rounded-md");

		rerender(<Skeleton className="rounded-bar h-2" />);
		expect(container.firstElementChild).toHaveClass("rounded-bar");
		expect(container.firstElementChild).not.toHaveClass("rounded-md");
	});

	test("does not shimmer or move, because motion only follows an action", () => {
		const { container } = render(<Skeleton />);

		expect(container.firstElementChild?.className).not.toMatch(
			/animate|shimmer|pulse/,
		);
	});

	test("many of them stack as separate blocks", () => {
		const { container } = render(
			<>
				<Skeleton className="w-[38%]" />
				<Skeleton className="w-[22%]" />
			</>,
		);

		expect(container.children).toHaveLength(2);
	});
});
