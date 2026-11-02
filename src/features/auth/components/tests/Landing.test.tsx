import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Landing, LANDING_LINE } from "../Landing";

describe("Landing (BR-F01-27)", () => {
	// AC-F01-15
	test("shows the name, F01's line, Sign up and Log in", () => {
		render(<Landing />);
		expect(
			screen.getByRole("heading", { level: 1, name: "Daybook" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Your money, day by day. Budgets, Subscriptions, Goals and a dashboard that stays correct offline.",
			),
		).toBeInTheDocument();
		expect(LANDING_LINE).toBe(
			"Your money, day by day. Budgets, Subscriptions, Goals and a dashboard that stays correct offline.",
		);
		expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
			"href",
			"/signup",
		);
		expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
			"href",
			"/login",
		);
	});

	test("is one main landmark", () => {
		render(<Landing />);
		expect(screen.getAllByRole("main")).toHaveLength(1);
	});

	test("has no posts section before F14 (D-503)", () => {
		render(<Landing />);
		expect(screen.queryByRole("article")).not.toBeInTheDocument();
		expect(screen.getAllByRole("heading")).toHaveLength(1);
	});

	// AC-F01-15, BR-F01-25
	test("after a deletion, says the account was deleted", () => {
		render(<Landing deleted />);
		expect(screen.getByRole("status")).toHaveTextContent(
			"Your account was deleted.",
		);
	});

	test("says nothing about a deletion otherwise", () => {
		render(<Landing />);
		expect(
			screen.queryByText("Your account was deleted."),
		).not.toBeInTheDocument();
	});
});
