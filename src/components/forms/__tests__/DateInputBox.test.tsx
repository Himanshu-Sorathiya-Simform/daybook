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

	// WCAG 2.5.8 (axe target-size): each part is a target of at least 24 by 24 px.
	test("gives each part a target of at least 24 px, and the separators none", () => {
		renderBox();

		for (const part of screen.getAllByRole("spinbutton")) {
			expect(part).toHaveClass("min-h-6", "min-w-6");
		}
		for (const literal of document.querySelectorAll('[data-type="literal"]')) {
			expect(literal).toHaveClass(
				"type-literal:min-h-0",
				"type-literal:min-w-0",
			);
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
