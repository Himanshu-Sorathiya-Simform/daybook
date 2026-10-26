import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Skeleton } from "@/components/feedback/Skeleton";

describe("default", () => {
	test("is hidden from screen readers", () => {
		const { container } = render(<Skeleton />);

		expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
	});

	test("takes its size from the caller's classes, which win over the default line", () => {
		const { container } = render(<Skeleton className="h-15 w-45" />);

		expect(container.firstElementChild).toHaveClass("h-15", "w-45");
		expect(container.firstElementChild).not.toHaveClass("h-3.5", "w-full");
	});
});
