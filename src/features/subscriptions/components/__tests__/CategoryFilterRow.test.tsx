import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { CategoryFilterRow } from "../CategoryFilterRow";

function setup(category: "health" | "entertainment" = "health", className?: string) {
	const onClear = vi.fn();
	render(
		<CategoryFilterRow
			category={category}
			onClear={onClear}
			{...(className === undefined ? {} : { className })}
		/>,
	);
	return { onClear, user: userEvent.setup() };
}

describe("CategoryFilterRow (BR-F05-50)", () => {
	test("says Showing, with the category as a chip and Show all", () => {
		setup();
		expect(screen.getByText("Showing")).toBeVisible();
		expect(screen.getByRole("grid", { name: "Showing" })).toHaveTextContent(
			"Health",
		);
		expect(screen.getByRole("button", { name: "Show all" })).toBeVisible();
	});

	test("names the category it is given", () => {
		setup("entertainment");
		expect(screen.getByRole("grid", { name: "Showing" })).toHaveTextContent(
			"Entertainment",
		);
	});

	test("the chip's remove button clears the filter", async () => {
		const { onClear, user } = setup();
		await user.click(screen.getByRole("button", { name: /Remove/ }));
		expect(onClear).toHaveBeenCalledOnce();
	});

	test("Show all clears it", async () => {
		const { onClear, user } = setup();
		await user.click(screen.getByRole("button", { name: "Show all" }));
		expect(onClear).toHaveBeenCalledOnce();
	});

	test("takes the caller's classes", () => {
		setup("health", "pt-0");
		expect(screen.getByText("Showing").parentElement).toHaveClass("pt-0");
	});
});
