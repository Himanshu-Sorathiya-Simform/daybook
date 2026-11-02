import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AuthCard } from "../AuthCard";

describe("AuthCard", () => {
	test("is the page's main landmark with its title as the one h1", () => {
		render(
			<AuthCard title="Log in">
				<p>form</p>
			</AuthCard>,
		);
		expect(screen.getByRole("main")).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { level: 1, name: "Log in" }),
		).toBeInTheDocument();
		expect(screen.getAllByRole("heading")).toHaveLength(1);
		expect(screen.getByText("form")).toBeInTheDocument();
	});

	test("the name links home", () => {
		render(<AuthCard title="Log in">x</AuthCard>);
		expect(screen.getByRole("link", { name: "Daybook" })).toHaveAttribute(
			"href",
			"/",
		);
	});

	test("adds the caller's classes to the column", () => {
		render(
			<AuthCard
				title="Log in"
				className="gap-8"
			>
				<p>form</p>
			</AuthCard>,
		);
		expect(screen.getByText("form").parentElement).toHaveClass(
			"gap-8",
			"max-w-sm",
		);
	});
});
