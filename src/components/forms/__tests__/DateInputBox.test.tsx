import { parseDate } from "@internationalized/date";
import { render, screen } from "@testing-library/react";
import { DateField as AriaDateField, I18nProvider } from "react-aria-components";
import { describe, expect, test } from "vitest";

import { DateInputBox } from "@/components/forms/DateInputBox";

function renderBox(className?: string) {
	render(
		<I18nProvider locale="en-IN">
			<AriaDateField
				aria-label="From"
				defaultValue={parseDate("2026-10-05")}
			>
				<DateInputBox {...(className ? { className } : {})} />
			</AriaDateField>
		</I18nProvider>,
	);
}

describe("DateInputBox", () => {
	test("shows each part as a spin button, with the separators hidden from reading", () => {
		renderBox();

		expect(screen.getAllByRole("spinbutton")).toHaveLength(3);
		const literals = document.querySelectorAll('[data-type="literal"]');
		expect(literals).toHaveLength(2);
		for (const literal of literals) {
			expect(literal).toHaveAttribute("aria-hidden", "true");
			expect(literal).toHaveClass("type-literal:px-0");
		}
	});

	test("shows the focus ring around the box while a part is focused", () => {
		renderBox();

		expect(screen.getByRole("group")).toHaveClass("focus-within:focus-ring");
	});

	test("puts the caller's classes on the box, after its own", () => {
		renderBox("w-40");

		expect(screen.getByRole("group")).toHaveClass("flex", "w-40");
	});
});
