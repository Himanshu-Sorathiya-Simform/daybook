import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { GroupHeader } from "@/components/data/GroupHeader";

function renderHeader(props: Parameters<typeof GroupHeader>[0]) {
	const { container, rerender } = render(<GroupHeader {...props} />);
	const root = container.firstElementChild as HTMLElement;
	return { root, rerender };
}

describe("label", () => {
	test.each([
		"Today",
		"Yesterday · Sun, 1 Nov",
		"Sat, 31 Oct 2025",
		"4 · Food",
		"Vacation (Goal)",
	])("shows %j", (label) => {
		const { root } = renderHeader({ label });

		expect(root.firstElementChild).toHaveTextContent(label);
	});

	test("cuts a long label with an ellipsis and leaves the figures room", () => {
		const { root } = renderHeader({
			label: "12 · ".concat("Very long payee name ".repeat(6)),
			figures: "Out ₹1,000.00",
		});

		expect(root.firstElementChild).toHaveClass("truncate", "min-w-0", "flex-1");
	});
});

describe("figures", () => {
	test("shows them after the label, kept on one line in tabular figures", () => {
		const { root } = renderHeader({
			label: "Today",
			figures: "In ₹85,000.00 · Out ₹18,000.00",
		});

		const figures = root.lastElementChild!;
		expect(figures).toHaveTextContent("In ₹85,000.00 · Out ₹18,000.00");
		expect(figures).toHaveClass("figures", "whitespace-nowrap", "shrink-0");
	});

	test("reads the label and figures apart, with a space between", () => {
		const { root } = renderHeader({
			label: "Today",
			figures: "Out ₹845.00",
		});

		expect(root.textContent).toBe("Today Out ₹845.00");
	});

	test("shows a negative To Goals as From Goals with a plus, as given", () => {
		const { root } = renderHeader({
			label: "Sat, 31 Oct",
			figures: "From Goals +₹1,000.00",
		});

		expect(root).toHaveTextContent("From Goals +₹1,000.00");
	});

	test.each([undefined, ""])(
		"shows only the label when the figures are %j",
		(figures) => {
			const { root } = renderHeader({
				label: "Today",
				...(figures === undefined ? {} : { figures }),
			});

			expect(root.children).toHaveLength(1);
			expect(root.textContent).toBe("Today");
		},
	);

	test("follows figures that change", () => {
		const { root, rerender } = renderHeader({ label: "Today" });

		rerender(
			<GroupHeader
				label="Today"
				figures="Out ₹1.00"
			/>,
		);

		expect(root).toHaveTextContent("Today Out ₹1.00");
	});
});

describe("markup", () => {
	test("has no role, so the list that holds it decides it", () => {
		const { root } = renderHeader({ label: "Today", figures: "Out ₹1.00" });

		expect(root).not.toHaveAttribute("role");
		expect(root.querySelector("[role]")).toBeNull();
	});

	test("is the design's day header: semibold caption in the second ink", () => {
		const { root } = renderHeader({ label: "Today" });

		expect(root).toHaveClass(
			"text-caption",
			"text-ink-2",
			"font-semibold",
			"items-baseline",
		);
	});

	test("takes the caller's classes on the root, last", () => {
		const { root } = renderHeader({ label: "Today", className: "pt-0 px-5" });

		expect(root).toHaveClass("pt-0", "px-5");
		expect(root).not.toHaveClass("pt-4");
	});
});
