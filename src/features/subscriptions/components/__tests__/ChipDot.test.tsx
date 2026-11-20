import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ChipDot } from "../ChipDot";
import { entry } from "./calendar-data";

const dot = (kind: Parameters<typeof entry>[0], category = "entertainment") =>
	render(
		<ChipDot item={entry(kind, "2026-11-05", "Netflix", 64900, { category })} />,
	).container.firstElementChild as HTMLElement;

describe("ChipDot (BR-F05-38)", () => {
	test("a charge is a filled dot in its category's colour", () => {
		const element = dot("charged");
		expect(element.style.background).toBe("var(--cat-entertainment)");
		expect(element).not.toHaveClass("border-[1.5px]");
	});

	test("a due item is a ring in its category's colour over the page", () => {
		const element = dot("due", "housing");
		expect(element).toHaveClass("border-[1.5px]", "border-solid", "bg-page");
		expect(element.style.borderColor).toBe("var(--cat-housing)");
		expect(element.style.background).toBe("");
	});

	test("skipped and paused items are rings too", () => {
		expect(dot("skipped")).toHaveClass("border-solid");
		expect(dot("paused")).toHaveClass("border-solid");
	});

	test("a pending item is a dashed ring", () => {
		expect(dot("pending")).toHaveClass("border-dashed");
	});

	test("a category with an underscore reads its dashed colour", () => {
		expect(dot("charged", "fees_taxes").style.background).toBe(
			"var(--cat-fees-taxes)",
		);
	});

	test("is hidden from screen readers, the kind being in the button's name", () => {
		expect(dot("due")).toHaveAttribute("aria-hidden", "true");
	});

	test("takes the caller's classes last", () => {
		const element = render(
			<ChipDot
				item={entry("due", "2026-11-05", "Netflix", 64900)}
				className="mt-1"
			/>,
		).container.firstElementChild;
		expect(element).toHaveClass("mt-1", "size-2");
	});
});
