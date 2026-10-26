import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CategoryTag } from "@/components/data/CategoryTag";
import { CATEGORY_LABELS, categoryColor, type CategoryKey } from "@/lib/categories";

const KEYS = Object.keys(CATEGORY_LABELS) as CategoryKey[];

describe("label variant", () => {
	test("is the default: an icon and the name", () => {
		render(<CategoryTag category="food" />);

		const tag = screen.getByText("Food");
		expect(tag.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
		expect(tag.firstElementChild?.tagName.toLowerCase()).toBe("svg");
	});

	test.each(KEYS)("%s shows its label and its own colour", (category) => {
		render(<CategoryTag category={category} />);

		const tag = screen.getByText(CATEGORY_LABELS[category]);
		expect(tag.querySelector("svg")?.style.color).toBe(categoryColor(category));
	});

	test("is bold ink text that never wraps", () => {
		render(<CategoryTag category="food" />);

		expect(screen.getByText("Food")).toHaveClass(
			"font-semibold",
			"text-ink",
			"whitespace-nowrap",
		);
	});

	test("takes the caller's classes", () => {
		render(
			<CategoryTag
				category="food"
				className="ml-2"
			/>,
		);

		expect(screen.getByText("Food")).toHaveClass("ml-2", "inline-flex");
	});
});

describe("dot variant", () => {
	test.each(KEYS)("%s shows a dot in its colour and the name", (category) => {
		render(
			<CategoryTag
				category={category}
				variant="dot"
			/>,
		);

		const tag = screen.getByText(CATEGORY_LABELS[category]);
		const dot = tag.firstElementChild as HTMLElement;
		expect(dot).toHaveAttribute("aria-hidden", "true");
		expect(dot.style.background).toBe(categoryColor(category));
	});

	test("shows no icon, and is secondary text", () => {
		render(
			<CategoryTag
				category="housing"
				variant="dot"
			/>,
		);

		const tag = screen.getByText("Housing");
		expect(tag.querySelector("svg")).toBeNull();
		expect(tag).toHaveClass("text-caption", "text-ink-2");
	});

	test("takes the caller's classes", () => {
		render(
			<CategoryTag
				category="housing"
				variant="dot"
				className="mt-1"
			/>,
		);

		expect(screen.getByText("Housing")).toHaveClass("mt-1");
	});
});

describe("icon variant", () => {
	test.each(KEYS)("%s is an image named by the category label", (category) => {
		render(
			<CategoryTag
				category={category}
				variant="icon"
			/>,
		);

		expect(
			screen.getByRole("img", { name: CATEGORY_LABELS[category] }),
		).toBeInTheDocument();
	});

	test("has the category colour and no visible text", () => {
		const { container } = render(
			<CategoryTag
				category="salary"
				variant="icon"
			/>,
		);

		expect((container.firstElementChild as SVGElement).style.color).toBe(
			"var(--cat-salary)",
		);
		expect(container).toHaveTextContent("");
	});

	test("takes the caller's classes", () => {
		render(
			<CategoryTag
				category="salary"
				variant="icon"
				className="ml-1"
			/>,
		);

		expect(screen.getByRole("img", { name: "Salary" })).toHaveClass(
			"ml-1",
			"shrink-0",
		);
	});
});

describe("every category", () => {
	test("has its own icon in the label variant, so colour is never the only signal", () => {
		const icons = KEYS.map((category) => {
			const { container, unmount } = render(
				<CategoryTag category={category} />,
			);
			const icon = container
				.querySelector("svg")!
				.getAttribute("class")!
				.match(/lucide-[\w-]+/)![0];
			unmount();
			return icon;
		});

		expect(new Set(icons).size).toBe(KEYS.length);
	});

	test("has its own colour", () => {
		expect(new Set(KEYS.map(categoryColor)).size).toBe(KEYS.length);
	});
});
