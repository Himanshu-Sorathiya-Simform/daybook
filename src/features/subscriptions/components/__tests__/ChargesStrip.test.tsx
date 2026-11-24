import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { StripItem } from "../../lib/edit-plan";
import { ChargesStrip } from "../ChargesStrip";

const ITEMS: StripItem[] = [
	{ kind: "kept", label: "5 Oct", amount: "₹649.00" },
	{ kind: "today", label: "Today" },
	{ kind: "off", label: "5 Nov", amount: "₹649.00", note: "moves" },
	{
		kind: "new",
		label: "15 Nov",
		amount: "₹799.00",
		note: "second charge",
		warn: true,
	},
	{ kind: "new", label: "5 Dec", amount: "₹799.00" },
	{ kind: "more", label: "" },
];

describe("the strip of charges around today (BR-F05-24)", () => {
	test("is a list named Charges around today", () => {
		render(<ChargesStrip items={ITEMS} />);
		expect(
			screen.getByRole("list", { name: "Charges around today" }),
		).toBeVisible();
	});

	test("lists a cell for each charge, and none for Today or the arrow", () => {
		render(<ChargesStrip items={ITEMS} />);
		const cells = within(screen.getByRole("list")).getAllByRole("listitem");
		expect(cells.map((cell) => cell.textContent)).toEqual([
			"5 Oct₹649.00",
			"5 Nov₹649.00moves",
			"15 Nov₹799.00second charge",
			"5 Dec₹799.00",
		]);
	});

	test("Today is hidden from screen readers", () => {
		render(<ChargesStrip items={ITEMS} />);
		const today = screen.getByText("Today");
		expect(today.closest("[aria-hidden='true']")).not.toBeNull();
	});

	test("a charge that goes is struck through, a new one bold", () => {
		render(<ChargesStrip items={ITEMS} />);
		expect(screen.getAllByText("₹649.00")[1]?.tagName).toBe("S");
		expect(screen.getAllByText("₹799.00")[0]?.tagName).toBe("B");
		expect(screen.getAllByText("₹649.00")[0]?.tagName).toBe("SPAN");
	});

	test("a warning note is marked, a plain one is not", () => {
		render(<ChargesStrip items={ITEMS} />);
		expect(screen.getByText("second charge")).toHaveClass("text-neg");
		expect(screen.getByText("moves")).not.toHaveClass("text-neg");
	});

	test("a cell without an amount or note shows its date alone", () => {
		render(<ChargesStrip items={[{ kind: "kept", label: "5 Oct" }]} />);
		expect(screen.getByRole("listitem")).toHaveTextContent(/^5 Oct$/);
	});

	test("an empty strip is an empty list", () => {
		render(<ChargesStrip items={[]} />);
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
	});
});
