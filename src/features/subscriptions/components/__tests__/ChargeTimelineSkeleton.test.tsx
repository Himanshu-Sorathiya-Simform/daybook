import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ChargeTimelineSkeleton } from "../ChargeTimelineSkeleton";

const rows = (container: HTMLElement) =>
	container.querySelectorAll(".grid-cols-\\[minmax\\(0\\,1fr\\)_auto\\]");

describe("ChargeTimelineSkeleton (BR-F05-40)", () => {
	test("is one busy status named Loading charges", () => {
		render(
			<ChargeTimelineSkeleton
				count={4}
				toggle={false}
			/>,
		);
		expect(
			screen.getByRole("status", { name: "Loading charges" }),
		).toHaveAttribute("aria-busy", "true");
	});

	test.each([1, 2, 4, 7])("draws %i lines in the real two-row layout", (count) => {
		const { container } = render(
			<ChargeTimelineSkeleton
				count={count}
				toggle={false}
			/>,
		);
		expect(rows(container)).toHaveLength(count);
	});

	test("each line has a date, an amount and a caption bar, as a charge does", () => {
		const { container } = render(
			<ChargeTimelineSkeleton
				count={1}
				toggle={false}
			/>,
		);
		expect(container.querySelectorAll(".bg-track")).toHaveLength(3);
	});

	test("lines carry the real timeline's padding and rule", () => {
		const { container } = render(
			<ChargeTimelineSkeleton
				count={2}
				toggle={false}
			/>,
		);
		for (const row of rows(container))
			expect(row).toHaveClass("py-2.5", "border-b", "border-line");
	});

	test("with a Show all to follow it holds a button-sized bar after the lines", () => {
		const { container } = render(
			<ChargeTimelineSkeleton
				count={7}
				toggle
			/>,
		);
		expect(container.querySelector(".h-8")).not.toBeNull();
		const without = render(
			<ChargeTimelineSkeleton
				count={7}
				toggle={false}
			/>,
		);
		expect(without.container.querySelector(".h-8")).toBeNull();
	});

	test("with no line to expect it holds one line of text, for No charges yet.", () => {
		const { container } = render(
			<ChargeTimelineSkeleton
				count={0}
				toggle={false}
			/>,
		);
		expect(rows(container)).toHaveLength(0);
		expect(container.querySelectorAll(".bg-track")).toHaveLength(1);
	});

	test("is not a list: only the real timeline is one", () => {
		render(
			<ChargeTimelineSkeleton
				count={4}
				toggle
			/>,
		);
		expect(screen.queryByRole("list")).toBeNull();
		expect(screen.queryByRole("listitem")).toBeNull();
	});
});
