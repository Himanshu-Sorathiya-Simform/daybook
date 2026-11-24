import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ScheduleLine } from "../ScheduleLine";

describe("the schedule line (BR-F05-24)", () => {
	test("shows how it repeats and when the next charges are", () => {
		render(
			<ScheduleLine
				summary={{
					repeats: "Every month on the 5th · ₹7,788.00 a year",
					next: "Next charges: Thu, 5 Nov, Sat, 5 Dec.",
				}}
			/>,
		);
		expect(
			screen.getByText("Every month on the 5th · ₹7,788.00 a year"),
		).toBeVisible();
		expect(
			screen.getByText("Next charges: Thu, 5 Nov, Sat, 5 Dec."),
		).toBeVisible();
	});

	test("with no next date it has one line", () => {
		const { container } = render(
			<ScheduleLine summary={{ repeats: "Every Thursday", next: null }} />,
		);
		expect(container.querySelectorAll("p")).toHaveLength(1);
	});

	test("keeps the caller's class", () => {
		const { container } = render(
			<ScheduleLine
				summary={{ repeats: "Every Thursday", next: null }}
				className="mt-2"
			/>,
		);
		expect(container.firstElementChild).toHaveClass("mt-2");
	});
});
