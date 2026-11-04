import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Header } from "../Header";

describe("Header (root section 4, D-504)", () => {
	test("is the banner landmark and holds what it is given", () => {
		render(
			<Header onAdd={vi.fn()}>
				<button type="button">Account menu</button>
			</Header>,
		);
		const header = screen.getByRole("banner");
		expect(
			within(header).getByRole("button", { name: "Account menu" }),
		).toBeInTheDocument();
	});

	test("puts Add and then its controls at the right, after a flexible space", () => {
		render(
			<Header onAdd={vi.fn()}>
				<button type="button">Account menu</button>
			</Header>,
		);
		const header = screen.getByRole("banner");
		const [name, spacer, add, button] = [...header.children];
		expect(name).toHaveTextContent("Daybook");
		expect(spacer).toHaveClass("flex-1");
		expect(add).toHaveAccessibleName("Add Transaction");
		expect(button).toHaveAccessibleName("Account menu");
	});

	// D-512: the sidebar, which carries the name, is gone below 768px.
	test("shows the name only below 768px", () => {
		render(<Header onAdd={vi.fn()}>{null}</Header>);
		expect(screen.getByText("Daybook")).toHaveClass("md:hidden");
	});

	test("has none of the controls that wait for their features yet", () => {
		render(<Header onAdd={vi.fn()}>{null}</Header>);
		const header = screen.getByRole("banner");
		expect(within(header).getAllByRole("button")).toHaveLength(1);
		expect(within(header).queryByRole("link")).toBeNull();
		expect(header).not.toHaveTextContent(/Search|Upgrade|Premium/);
	});

	// D-548
	test("Add Transaction shows its N key cap and opens the entry dialog", async () => {
		const onAdd = vi.fn();
		render(<Header onAdd={onAdd}>{null}</Header>);

		const add = screen.getByRole("button", { name: "Add Transaction" });
		expect(add.querySelector("kbd")).toHaveTextContent("N");
		await userEvent.setup().click(add);

		expect(onAdd).toHaveBeenCalledOnce();
	});

	test("Add opens from the keyboard", async () => {
		const onAdd = vi.fn();
		render(<Header onAdd={onAdd}>{null}</Header>);
		const user = userEvent.setup();

		await user.tab();
		await user.keyboard("{Enter}");

		expect(onAdd).toHaveBeenCalledOnce();
	});

	// D-548: on phones the bottom bar's Add takes its place.
	test("Add shows from 768px only", () => {
		render(<Header onAdd={vi.fn()}>{null}</Header>);

		expect(screen.getByRole("button", { name: "Add Transaction" })).toHaveClass(
			"max-md:hidden",
		);
	});

	test("takes a class name", () => {
		render(
			<Header
				onAdd={vi.fn()}
				className="sticky"
			>
				{null}
			</Header>,
		);
		expect(screen.getByRole("banner")).toHaveClass("sticky");
	});
});
