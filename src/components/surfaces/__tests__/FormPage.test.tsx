import { render, screen } from "@testing-library/react";
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

	test("adds the caller's classes to the column", () => {
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
			"max-w-sm",
		);
	});
});
