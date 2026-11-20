import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { DockedPanel } from "../DockedPanel";

describe("DockedPanel (D-621)", () => {
	test("is a complementary landmark with the given name", () => {
		render(<DockedPanel label="Subscription">Content</DockedPanel>);
		expect(
			screen.getByRole("complementary", { name: "Subscription" }),
		).toBeVisible();
		expect(screen.getByText("Content")).toBeVisible();
	});

	test("is sticky and hidden below the dock breakpoint", () => {
		render(<DockedPanel label="Panel">x</DockedPanel>);
		const aside = screen.getByRole("complementary");
		expect(aside).toHaveClass("sticky", "top-7", "max-dock:hidden");
	});

	test("never grows past the screen: its frame is capped and its content scrolls inside", () => {
		render(<DockedPanel label="Panel">x</DockedPanel>);
		const frame = screen.getByRole("complementary")
			.firstElementChild as HTMLElement;
		expect(frame.className).toContain("max-h-[calc(100dvh-3.5rem)]");
		expect(frame).toHaveClass("overflow-hidden");
		const scroller = screen.getByText("x");
		expect(scroller).toHaveClass(
			"overflow-y-auto",
			"overscroll-contain",
			"scrollbar-thin",
			"min-h-0",
		);
	});

	test("the frame keeps a minimum height that also gives way on a short screen", () => {
		render(<DockedPanel label="Panel">x</DockedPanel>);
		const frame = screen.getByRole("complementary")
			.firstElementChild as HTMLElement;
		expect(frame.className).toContain("min-h-[min(35rem,calc(100dvh-3.5rem))]");
	});

	test("its content fills the height, so a footer can sit at the bottom", () => {
		render(
			<DockedPanel label="Panel">
				<div data-testid="child">child</div>
			</DockedPanel>,
		);
		expect(screen.getByTestId("child").parentElement?.className).toContain(
			"*:grow",
		);
	});

	test("takes extra classes for the aside, after its own", () => {
		render(
			<DockedPanel
				label="Panel"
				className="custom"
			>
				x
			</DockedPanel>,
		);
		expect(screen.getByRole("complementary")).toHaveClass("sticky", "custom");
	});

	test("the Section's own padding is removed, so the scroller carries it", () => {
		render(<DockedPanel label="Panel">x</DockedPanel>);
		const frame = screen.getByRole("complementary")
			.firstElementChild as HTMLElement;
		expect(frame).toHaveClass("px-0", "py-0");
		expect(frame).not.toHaveClass("px-6");
	});
});
