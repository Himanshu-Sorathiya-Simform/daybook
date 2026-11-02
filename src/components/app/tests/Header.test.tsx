import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Header } from "../Header";

describe("Header (root section 4, D-504)", () => {
	test("is the banner landmark and holds what it is given", () => {
		render(
			<Header>
				<button type="button">Account menu</button>
			</Header>,
		);
		const header = screen.getByRole("banner");
		expect(
			within(header).getByRole("button", { name: "Account menu" }),
		).toBeInTheDocument();
	});

	test("puts its controls at the right, after a flexible space", () => {
		render(
			<Header>
				<button type="button">Account menu</button>
			</Header>,
		);
		const header = screen.getByRole("banner");
		const [name, spacer, button] = [...header.children];
		expect(name).toHaveTextContent("Daybook");
		expect(spacer).toHaveClass("flex-1");
		expect(button).toHaveAccessibleName("Account menu");
	});

	// D-512: the sidebar, which carries the name, is gone below 768px.
	test("shows the name only below 768px", () => {
		render(<Header>{null}</Header>);
		expect(screen.getByText("Daybook")).toHaveClass("md:hidden");
	});

	test("has none of the controls that wait for their features yet", () => {
		render(<Header>{null}</Header>);
		const header = screen.getByRole("banner");
		expect(within(header).queryByRole("button")).toBeNull();
		expect(within(header).queryByRole("link")).toBeNull();
		expect(header).not.toHaveTextContent(/Search|Upgrade|Premium|Add/);
	});

	test("takes a class name", () => {
		render(<Header className="sticky">{null}</Header>);
		expect(screen.getByRole("banner")).toHaveClass("sticky");
	});
});
