import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LineSkeleton } from "../LineSkeleton";

describe("LineSkeleton", () => {
	test.each([
		["figure", "text-figure"],
		["heading", "text-heading"],
		["body", "text-body"],
		["label", "text-label"],
		["caption", "text-caption"],
	] as const)("a %s line is one line of %s tall", (size, text) => {
		const { container } = render(
			<LineSkeleton
				size={size}
				width="w-24"
			/>,
		);
		expect(container.firstElementChild).toHaveClass("h-lh", text);
	});

	test("its bar has the letters' height and the given width, and is hidden from screen readers", () => {
		const { container } = render(
			<LineSkeleton
				size="body"
				width="w-24"
			/>,
		);
		const line = container.firstElementChild as HTMLElement;
		expect(line).toHaveAttribute("aria-hidden", "true");
		expect(line.firstElementChild).toHaveClass("h-[0.7em]", "w-24", "bg-track");
	});

	test("takes the caller's classes", () => {
		const { container } = render(
			<LineSkeleton
				size="body"
				width="w-24"
				className="justify-end"
			/>,
		);
		expect(container.firstElementChild).toHaveClass("flex", "justify-end");
	});
});
