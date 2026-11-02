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
});
