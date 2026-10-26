import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	Input as AriaInput,
	TextField as AriaTextField,
} from "react-aria-components";
import { describe, expect, test } from "vitest";

import { Field, type FieldProps } from "@/components/forms/Field";

/** Field only works inside a React Aria field, which links the label, hint and error. */
function renderField(
	props: Partial<Omit<FieldProps, "children">> = {},
	invalid = false,
) {
	return render(
		<AriaTextField isInvalid={invalid}>
			<Field
				label="Description"
				{...props}
			>
				<AriaInput />
			</Field>
		</AriaTextField>,
	);
}

describe("label", () => {
	test("names the control it sits around", () => {
		renderField();

		expect(
			screen.getByRole("textbox", { name: "Description" }),
		).toBeInTheDocument();
	});

	test("focuses the control when it is pressed", async () => {
		const user = userEvent.setup();
		renderField();

		await user.click(screen.getByText("Description"));

		expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus();
	});

	test("is a real label, not a placeholder", () => {
		renderField();

		expect(screen.getByText("Description").tagName).toBe("LABEL");
		expect(screen.getByRole("textbox")).not.toHaveAttribute("placeholder");
	});
});

describe("optional mark and counter", () => {
	test("shows (optional) only when asked", () => {
		renderField({ optional: true });
		expect(screen.getByText("(optional)")).toBeVisible();
	});

	test("has no (optional) mark by default", () => {
		renderField();
		expect(screen.queryByText("(optional)")).not.toBeInTheDocument();
	});

	test("shows the counter in the label row, after the label", () => {
		renderField({ counter: "31 / 500" });

		const counter = screen.getByText("31 / 500");
		const label = screen.getByText("Description");
		expect(counter).toHaveClass("figures");
		expect(counter.parentElement).toBe(label.parentElement);
		expect(
			label.compareDocumentPosition(counter)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("shows the optional mark and the counter together", () => {
		renderField({ optional: true, counter: "0 / 500" });

		expect(screen.getByText("(optional)")).toBeVisible();
		expect(screen.getByText("0 / 500")).toBeVisible();
	});

	test("does not become part of the control's name", () => {
		renderField({ optional: true, counter: "0 / 500" });

		expect(screen.getByRole("textbox")).toHaveAccessibleName(/^Description/);
	});
});

describe("hint and error", () => {
	test("shows the hint under the control and reads it with the control", () => {
		renderField({ hint: "Shown under the payee in your list." });

		expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
			"Shown under the payee in your list.",
		);
	});

	test("shows nothing under the control without a hint or an error", () => {
		renderField();

		expect(screen.getByRole("textbox")).not.toHaveAccessibleDescription();
	});

	test("shows the error instead of the hint when the field is invalid", () => {
		renderField({ hint: "A hint.", error: "Too long." }, true);

		expect(screen.getByText("Too long.")).toBeVisible();
		expect(screen.queryByText("A hint.")).not.toBeInTheDocument();
		expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Too long.");
	});

	test("shows the error in the negative colour", () => {
		renderField({ error: "Too long." }, true);

		expect(screen.getByText("Too long.")).toHaveClass("text-neg");
	});

	test("shows no error text unless React Aria's field is invalid (the form components always pair them)", () => {
		renderField({ hint: "A hint.", error: "Too long." }, false);

		expect(screen.queryByText("Too long.")).not.toBeInTheDocument();
		expect(screen.queryByText("A hint.")).not.toBeInTheDocument();
	});

	test("goes back to the hint when the error is cleared", () => {
		const { rerender } = renderField(
			{ hint: "A hint.", error: "Too long." },
			true,
		);

		rerender(
			<AriaTextField isInvalid={false}>
				<Field
					label="Description"
					hint="A hint."
				>
					<AriaInput />
				</Field>
			</AriaTextField>,
		);

		expect(screen.getByText("A hint.")).toBeVisible();
		expect(screen.queryByText("Too long.")).not.toBeInTheDocument();
	});
});

describe("className", () => {
	test("goes on the root of the label, control and message", () => {
		const { container } = render(
			<AriaTextField>
				<Field
					label="Description"
					className="mb-4"
				>
					<AriaInput />
				</Field>
			</AriaTextField>,
		);

		expect(
			container.querySelector("label")?.closest(".mb-4"),
		).toBeInTheDocument();
	});
});
