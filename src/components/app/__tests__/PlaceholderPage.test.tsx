import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { PlaceholderPage } from "../PlaceholderPage";

describe("PlaceholderPage (D-504, D-514)", () => {
	test.each(["Budgets", "Transactions", "Settings", "Learn"])(
		"%s: the name is the page's one heading",
		(name) => {
			render(<PlaceholderPage name={name} />);
			const headings = screen.getAllByRole("heading");
			expect(headings).toHaveLength(1);
			expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
				name,
			);
		},
	);

	test("says the feature is coming, in D-514's words", () => {
		render(<PlaceholderPage name="Budgets" />);
		expect(screen.getByText("Budgets is coming soon.")).toBeInTheDocument();
		expect(
			screen.getByText("It arrives in a later update."),
		).toBeInTheDocument();
	});

	test("offers no action, since there is nothing to do yet", () => {
		render(<PlaceholderPage name="Budgets" />);
		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByRole("link")).toBeNull();
	});

	test("takes a class name", () => {
		const { container } = render(
			<PlaceholderPage
				name="Budgets"
				className="mt-4"
			/>,
		);
		expect(container.firstElementChild).toHaveClass("mt-4");
	});
});
