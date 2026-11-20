import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ChargeChip } from "../ChargeChip";
import { CAL, entry } from "./calendar-data";

const NETFLIX = entry("due", "2026-11-05", "Netflix", 64900);

function setup(
	item = NETFLIX,
	props: Partial<Parameters<typeof ChargeChip>[0]> = {},
) {
	const onSelect = vi.fn();
	render(
		<ChargeChip
			item={item}
			formats={CAL}
			onSelect={onSelect}
			{...props}
		/>,
	);
	return { onSelect, user: userEvent.setup() };
}

describe("ChargeChip (BR-F05-38)", () => {
	test("is a button named by the item, its amount and its state", () => {
		setup();
		expect(
			screen.getByRole("button", { name: "Netflix, ₹649.00, due" }),
		).toBeVisible();
	});

	test.each([
		["charged", "Netflix, ₹649.00, charged"],
		["skipped", "Netflix, ₹649.00, skipped"],
		["paused", "Netflix, ₹649.00, paused"],
		["pending", "Netflix, ₹649.00, pending sync"],
	] as const)("a %s item is named with its state", (kind, name) => {
		setup(entry(kind, "2026-11-05", "Netflix", 64900));
		expect(screen.getByRole("button", { name })).toBeVisible();
	});

	test("shows the name over the amount in whole units", () => {
		setup();
		const button = screen.getByRole("button");
		expect(button).toHaveTextContent("Netflix₹649");
	});

	test("pressing it selects its item", async () => {
		const { onSelect, user } = setup();
		await user.click(screen.getByRole("button"));
		expect(onSelect).toHaveBeenCalledExactlyOnceWith(NETFLIX);
	});

	test("Enter and Space press it", async () => {
		const { onSelect, user } = setup();
		screen.getByRole("button").focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	test.each(["skipped", "paused"] as const)(
		"a %s item is struck through and muted",
		(kind) => {
			setup(entry(kind, "2026-11-05", "Netflix", 64900));
			expect(screen.getByText("Netflix")).toHaveClass("line-through");
			expect(screen.getByText("₹649")).toHaveClass("line-through");
			expect(screen.getByRole("button")).toHaveClass("text-ink-3");
		},
	);

	test.each(["charged", "due"] as const)("a %s item is not struck", (kind) => {
		setup(entry(kind, "2026-11-05", "Netflix", 64900));
		expect(screen.getByText("Netflix")).not.toHaveClass("line-through");
		expect(screen.getByRole("button")).toHaveClass("text-ink");
	});

	test("the marked item is tinted and bold; the others have a hover", () => {
		setup(NETFLIX, { isMarked: true });
		expect(screen.getByRole("button")).toHaveClass(
			"bg-accent-soft",
			"font-semibold",
		);
		expect(screen.getByRole("button")).not.toHaveClass("hover:bg-soft");
	});

	test("an unmarked item has a hover fill and a pointer", () => {
		setup();
		expect(screen.getByRole("button")).toHaveClass(
			"hover:bg-soft",
			"cursor-pointer",
		);
	});

	test("a long name is cut with an ellipsis and not wrapped", () => {
		setup(
			entry("due", "2026-11-05", "A very long Subscription name indeed", 100),
		);
		expect(screen.getByText("A very long Subscription name indeed")).toHaveClass(
			"truncate",
		);
	});

	test("takes the caller's classes", () => {
		setup(NETFLIX, { className: "mt-3" });
		expect(screen.getByRole("button")).toHaveClass("mt-3");
	});
});
