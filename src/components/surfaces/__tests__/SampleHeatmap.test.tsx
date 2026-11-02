import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { SampleHeatmap } from "@/components/surfaces/SampleHeatmap";

function cells(container: HTMLElement) {
	return Array.from(container.firstElementChild!.children) as HTMLElement[];
}

describe("SampleHeatmap", () => {
	test("is five weeks of seven days: 35 cells in a seven-column grid", () => {
		const { container } = render(<SampleHeatmap />);

		expect(container.firstElementChild).toHaveClass("grid", "grid-cols-7");
		expect(cells(container)).toHaveLength(35);
	});

	test("tints every cell between 0 and 100 percent of the accent colour", () => {
		const { container } = render(<SampleHeatmap />);

		for (const cell of cells(container)) {
			const match = /var\(--accent\) (\d+)%/.exec(cell.style.background);
			expect(match).not.toBeNull();
			const percent = Number(match![1]);
			expect(percent).toBeGreaterThanOrEqual(0);
			expect(percent).toBeLessThanOrEqual(100);
		}
	});

	test("mixes each tint into the page colour, so it follows light and dark", () => {
		const { container } = render(<SampleHeatmap />);

		for (const cell of cells(container)) {
			expect(cell.style.background).toContain("color-mix(in oklab");
			expect(cell.style.background).toContain("var(--page)");
		}
	});

	test("has the same pattern every time, a fixed sample that is never user data", () => {
		const first = render(<SampleHeatmap />).container.innerHTML;
		const second = render(<SampleHeatmap />).container.innerHTML;

		expect(first).toBe(second);
	});

	test("has some strong, some faint and some empty days, like a real month", () => {
		const { container } = render(<SampleHeatmap />);

		const percents = cells(container).map((cell) =>
			Number(/var\(--accent\) (\d+)%/.exec(cell.style.background)![1]),
		);
		expect(percents).toContain(0);
		expect(percents).toContain(100);
		expect(new Set(percents).size).toBeGreaterThan(4);
	});

	test("has no text, no image role and no focusable content", () => {
		const { container } = render(<SampleHeatmap />);

		expect(container).toHaveTextContent("");
		expect(container.querySelector("[role], a, button, input")).toBeNull();
	});

	test("takes the caller's classes after its own", () => {
		const { container } = render(<SampleHeatmap className="w-60 gap-2" />);

		expect(container.firstElementChild).toHaveClass("grid", "gap-2", "w-60");
		expect(container.firstElementChild).not.toHaveClass("gap-1");
	});
});
