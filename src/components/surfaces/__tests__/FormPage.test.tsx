import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { FormPage } from "../FormPage";

describe("FormPage", () => {
	test("is the page's main landmark with its title as the one h1", () => {
		render(
			<FormPage title="Log in">
				<p>form</p>
			</FormPage>,
		);
		expect(screen.getByRole("main")).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { level: 1, name: "Log in" }),
		).toBeInTheDocument();
		expect(screen.getAllByRole("heading")).toHaveLength(1);
		expect(screen.getByText("form")).toBeInTheDocument();
	});

	test("the name links home", () => {
		render(<FormPage title="Log in">x</FormPage>);
		expect(screen.getByRole("link", { name: "Daybook" })).toHaveAttribute(
			"href",
			"/",
		);
	});

	test("shows the intro line under the title", () => {
		render(
			<FormPage
				title="Set up Daybook"
				intro="Four quick choices. We filled in our best guesses."
			>
				x
			</FormPage>,
		);
		expect(
			screen.getByText("Four quick choices. We filled in our best guesses."),
		).toBeInTheDocument();
	});

	test("without an intro, only the title", () => {
		const { container } = render(<FormPage title="Log in">x</FormPage>);
		expect(container.querySelectorAll("p")).toHaveLength(0);
	});

	test("the name sits in a top bar, outside the main landmark", () => {
		render(<FormPage title="Log in">x</FormPage>);
		const bar = screen.getByRole("banner");
		expect(bar).toContainElement(screen.getByRole("link", { name: "Daybook" }));
		expect(screen.getByRole("main")).not.toContainElement(bar);
	});

	test("holds the title and the form in one framed card", () => {
		render(
			<FormPage title="Log in">
				<p>form</p>
			</FormPage>,
		);
		const card = screen.getByText("form").parentElement!;
		expect(card).toContainElement(
			screen.getByRole("heading", { level: 1, name: "Log in" }),
		);
		expect(card).toHaveClass("border", "rounded-section", "max-w-105");
	});

	test("adds the caller's classes to the card", () => {
		render(
			<FormPage
				title="Log in"
				className="gap-8"
			>
				<p>form</p>
			</FormPage>,
		);
		expect(screen.getByText("form").parentElement).toHaveClass(
			"gap-8",
			"max-w-105",
		);
	});

	test("wide, holds the title and the form in an unframed wide column", () => {
		render(
			<FormPage
				title="Set up Daybook"
				layout="wide"
			>
				<p>form</p>
			</FormPage>,
		);
		const column = screen.getByText("form").parentElement!;
		expect(column).toHaveClass("max-w-240");
		expect(column).not.toHaveClass("border", "max-w-105");
		expect(column).toContainElement(
			screen.getByRole("heading", { level: 1, name: "Set up Daybook" }),
		);
	});

	test("without the home link, the name is plain text", () => {
		render(
			<FormPage
				title="Set up Daybook"
				homeLink={false}
			>
				x
			</FormPage>,
		);
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		expect(
			within(screen.getByRole("banner")).getByText("Daybook"),
		).toBeInTheDocument();
	});

	test("puts the actions in the top bar, after the name", () => {
		render(
			<FormPage
				title="Set up Daybook"
				actions={<button type="button">Log out</button>}
			>
				x
			</FormPage>,
		);
		const bar = screen.getByRole("banner");
		const logOut = within(bar).getByRole("button", { name: "Log out" });
		expect(
			within(bar)
				.getByRole("link", { name: "Daybook" })
				.compareDocumentPosition(logOut) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(screen.getByRole("main")).not.toContainElement(logOut);
	});

	test("has no actions area without actions", () => {
		render(<FormPage title="Log in">x</FormPage>);
		expect(screen.getByRole("banner").children).toHaveLength(1);
	});
});
