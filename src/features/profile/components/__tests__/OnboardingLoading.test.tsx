import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { OnboardingLoading } from "../OnboardingLoading";

describe("OnboardingLoading", () => {
	test("is marked busy, with four field shapes and a button shape", () => {
		const { container } = render(<OnboardingLoading />);
		const outline = container.firstElementChild!;
		expect(outline).toHaveAttribute("aria-busy", "true");
		expect(outline.children).toHaveLength(5);
	});

	test("has nothing to press or type in", () => {
		const { container } = render(<OnboardingLoading />);
		expect(container.querySelector("button, input")).toBeNull();
	});
});
