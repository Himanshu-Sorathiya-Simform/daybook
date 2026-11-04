import { act, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, test } from "vitest";

import { focusFirstInvalid, useFocusFirstInvalid } from "../useFocusFirstInvalid";

/** A form whose fields turn invalid only when Check is pressed, as after a refused submit. */
function Form({ invalid }: { invalid: ("a" | "b")[] }) {
	const ref = useRef<HTMLFormElement>(null);
	const focus = useFocusFirstInvalid(ref);
	const [checked, setChecked] = useState(false);
	const mark = (name: "a" | "b") =>
		checked && invalid.includes(name) ? "true" : "false";
	return (
		<form ref={ref}>
			<input
				aria-label="A"
				aria-invalid={mark("a")}
			/>
			<input
				aria-label="B"
				aria-invalid={mark("b")}
			/>
			<button
				type="button"
				onClick={() => {
					setChecked(true);
					focus();
				}}
			>
				Check
			</button>
		</form>
	);
}

describe("useFocusFirstInvalid", () => {
	test("focuses the first field that turned invalid in the same render", () => {
		render(<Form invalid={["b"]} />);
		act(() => screen.getByRole("button", { name: "Check" }).click());
		expect(screen.getByLabelText("B")).toHaveFocus();
	});

	test("takes the first in document order when several are invalid", () => {
		render(<Form invalid={["b", "a"]} />);
		act(() => screen.getByRole("button", { name: "Check" }).click());
		expect(screen.getByLabelText("A")).toHaveFocus();
	});

	test("leaves focus alone when nothing is invalid", () => {
		render(<Form invalid={[]} />);
		const button = screen.getByRole("button", { name: "Check" });
		button.focus();
		act(() => button.click());
		expect(button).toHaveFocus();
	});

	test("moves nothing before it is asked", () => {
		render(<Form invalid={["a"]} />);
		expect(document.body).toHaveFocus();
	});

	test("asks again each time, even with the same fields invalid", () => {
		render(<Form invalid={["a"]} />);
		const button = screen.getByRole("button", { name: "Check" });
		act(() => button.click());
		button.focus();
		act(() => button.click());
		expect(screen.getByLabelText("A")).toHaveFocus();
	});
});

describe("focusFirstInvalid", () => {
	test("is harmless without a form", () => {
		expect(() => focusFirstInvalid(null)).not.toThrow();
	});

	/** Renders `html` in a form and answers it. */
	function formWith(html: string): HTMLFormElement {
		const { container } = render(<form />);
		const form = container.querySelector("form")!;
		form.innerHTML = html;
		return form;
	}

	test("in an invalid radio group, focuses its chosen radio", () => {
		const form = formWith(`
			<div role="radiogroup" aria-invalid="true">
				<input type="radio" name="c" aria-label="Food" />
				<input type="radio" name="c" aria-label="Health" checked />
			</div>`);

		focusFirstInvalid(form);

		expect(screen.getByLabelText("Health")).toHaveFocus();
	});

	test("in an invalid radio group with nothing chosen, focuses its first radio", () => {
		const form = formWith(`
			<div role="radiogroup" aria-invalid="true">
				<input type="radio" name="c" aria-label="Food" />
				<input type="radio" name="c" aria-label="Health" />
			</div>`);

		focusFirstInvalid(form);

		expect(screen.getByLabelText("Food")).toHaveFocus();
	});

	test("an invalid radio group without radios moves nothing", () => {
		const form = formWith(`<div role="radiogroup" aria-invalid="true"></div>`);

		expect(() => focusFirstInvalid(form)).not.toThrow();
		expect(document.body).toHaveFocus();
	});

	test("finds a picker's button marked data-invalid, in document order", () => {
		const form = formWith(`
			<button type="button" data-invalid="true">Date</button>
			<input aria-label="Time" aria-invalid="true" />`);

		focusFirstInvalid(form);

		expect(screen.getByRole("button", { name: "Date" })).toHaveFocus();
	});

	test("ignores a data-invalid that is not on a button, and aria-invalid false", () => {
		const form = formWith(`
			<div data-invalid="true" tabindex="-1">Group</div>
			<input aria-label="A" aria-invalid="false" />
			<input aria-label="B" aria-invalid="true" />`);

		focusFirstInvalid(form);

		expect(screen.getByLabelText("B")).toHaveFocus();
	});
});
