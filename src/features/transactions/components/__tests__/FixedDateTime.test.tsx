import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { FixedDateTime } from "../FixedDateTime";

describe("FixedDateTime (BR-F03-16, BR-F03-75)", () => {
	test("shows the date and the time as text, not as fields", () => {
		render(
			<FixedDateTime
				date="Mon 19 Oct"
				time="4:45 pm"
			/>,
		);
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
		const terms = screen.getAllByRole("term").map((term) => term.textContent);
		expect(terms).toEqual(["Date", "Time"]);
		const definitions = screen.getAllByRole("definition");
		expect(within(definitions[0]!).getByText("Mon 19 Oct")).toBeVisible();
		expect(within(definitions[1]!).getByText("4:45 pm")).toBeVisible();
	});

	test("a charge's time reads as the words it is given", () => {
		render(
			<FixedDateTime
				date="Today"
				time="Auto"
			/>,
		);
		expect(screen.getByText("Auto")).toBeVisible();
	});
});
