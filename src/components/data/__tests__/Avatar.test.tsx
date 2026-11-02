import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Avatar } from "@/components/data/Avatar";
import { CATEGORY_LABELS, categoryColor, type CategoryKey } from "@/lib/categories";

function root(container: HTMLElement) {
	return container.firstElementChild as HTMLElement;
}

describe("initials", () => {
	test.each([
		["Chai Point", "CP"],
		["BigBasket", "BI"],
		["Amazon Pay India", "AP"],
		["7-Eleven", "7E"],
		["a", "A"],
		["  chai   point  ", "CP"],
	])("%j shows %s", (payee, letters) => {
		const { container } = render(<Avatar payee={payee} />);

		expect(root(container)).toHaveTextContent(letters);
	});

	test("shows no svg while there are initials", () => {
		const { container } = render(<Avatar payee="Chai Point" />);

		expect(root(container).querySelector("svg")).toBeNull();
	});

	test("follows a payee that changes", () => {
		const { container, rerender } = render(<Avatar payee="Chai Point" />);

		rerender(<Avatar payee="Netflix" />);

		expect(root(container)).toHaveTextContent("NE");
	});
});

describe("no letters or digits", () => {
	test.each([undefined, "", "   ", "--", "😀"])(
		"%j shows the category icon",
		(payee) => {
			const { container } = render(
				<Avatar
					{...(payee === undefined ? {} : { payee })}
					category="transportation"
				/>,
			);

			expect(root(container)).toHaveTextContent("");
			expect(root(container).querySelector("svg")).toBeInTheDocument();
		},
	);

	test("shows the icon of the category it was given", () => {
		const food = render(
			<Avatar
				payee="--"
				category="food"
			/>,
		);
		const foodIcon = root(food.container)
			.querySelector("svg")!
			.getAttribute("class");
		food.unmount();

		const travel = render(
			<Avatar
				payee="--"
				category="travel"
			/>,
		);

		expect(
			root(travel.container).querySelector("svg")!.getAttribute("class"),
		).not.toBe(foodIcon);
	});

	test("colours the icon with the category colour", () => {
		const { container } = render(
			<Avatar
				payee="--"
				category="food"
			/>,
		);

		expect(root(container).querySelector("svg")?.style.color).toBe(
			"var(--cat-food)",
		);
	});
});

describe("category tint", () => {
	test.each(Object.keys(CATEGORY_LABELS) as CategoryKey[])(
		"%s tints with its own colour at 16 percent over the page",
		(category) => {
			const { container } = render(
				<Avatar
					payee="Chai Point"
					category={category}
				/>,
			);

			expect(root(container).style.background).toBe(
				`color-mix(in oklab, ${categoryColor(category)} 16%, var(--page))`,
			);
		},
	);

	test("is the Other category by default", () => {
		const { container } = render(<Avatar payee="Chai Point" />);

		expect(root(container).style.background).toContain("var(--cat-other)");
	});
});

describe("a Goal", () => {
	test("shows a piggy bank and no initials, whatever the payee is", () => {
		const { container } = render(
			<Avatar
				goal
				payee="Vacation"
				category="food"
			/>,
		);

		expect(root(container)).toHaveTextContent("");
		expect(root(container).querySelector("svg")).toBeInTheDocument();
	});

	test("uses the salary colour, not the category's", () => {
		const { container } = render(
			<Avatar
				goal
				category="food"
			/>,
		);

		expect(root(container).style.background).toContain("var(--cat-salary)");
		expect(root(container).querySelector("svg")?.style.color).toBe(
			"var(--cat-salary)",
		);
	});

	test("looks different from a payee with no letters", () => {
		const goal = render(<Avatar goal />);
		const goalIcon = root(goal.container)
			.querySelector("svg")!
			.getAttribute("class");
		goal.unmount();
		const blank = render(<Avatar payee="--" />);

		expect(
			root(blank.container).querySelector("svg")!.getAttribute("class"),
		).not.toBe(goalIcon);
	});
});

describe("pending", () => {
	test("has a dashed edge, which marks it without colour", () => {
		const { container } = render(
			<Avatar
				payee="Chai Point"
				pending
			/>,
		);

		expect(root(container)).toHaveClass("border-dashed", "border-edge");
	});

	test("has no edge when it is not pending", () => {
		const { container } = render(<Avatar payee="Chai Point" />);

		expect(root(container)).not.toHaveClass("border-dashed");
	});

	test("a pending Goal has the dashed edge too", () => {
		const { container } = render(
			<Avatar
				goal
				pending
			/>,
		);

		expect(root(container)).toHaveClass("border-dashed");
	});
});

describe("size", () => {
	test.each([
		["sm", "size-7", "text-axis", "size-3.25"],
		["md", "size-9", "text-small", "size-4"],
		["lg", "size-11", "text-body", "size-5"],
	] as const)(
		"%s is %s with %s letters and a %s icon",
		(size, box, text, icon) => {
			const withLetters = render(
				<Avatar
					payee="Chai Point"
					size={size}
				/>,
			);
			expect(root(withLetters.container)).toHaveClass(box, text);
			withLetters.unmount();

			const withIcon = render(
				<Avatar
					goal
					size={size}
				/>,
			);
			expect(root(withIcon.container).querySelector("svg")).toHaveClass(icon);
		},
	);

	test("is medium by default", () => {
		const { container } = render(<Avatar payee="Chai Point" />);

		expect(root(container)).toHaveClass("size-9");
	});
});

describe("accessibility and look", () => {
	test("is hidden from screen readers, because the row's title names the payee", () => {
		const { container } = render(<Avatar payee="Chai Point" />);

		expect(root(container)).toHaveAttribute("aria-hidden", "true");
	});

	test("is a round, bold badge that does not shrink in a row", () => {
		const { container } = render(<Avatar payee="Chai Point" />);

		expect(root(container)).toHaveClass(
			"rounded-full",
			"font-bold",
			"shrink-0",
			"text-ink",
		);
	});

	test("takes the caller's classes", () => {
		const { container } = render(
			<Avatar
				payee="Chai Point"
				className="ml-2"
			/>,
		);

		expect(root(container)).toHaveClass("ml-2", "rounded-full");
	});
});
