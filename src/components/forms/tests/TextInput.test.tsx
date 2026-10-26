import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Search } from "lucide-react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { TextInput, type TextInputProps } from "@/components/forms/TextInput";

describe("label", () => {
	test("names the input, and pressing it focuses the input", async () => {
		const user = userEvent.setup();
		render(<TextInput label="Description" />);

		await user.click(screen.getByText("Description"));

		expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus();
	});

	test("is required, visible text and never replaced by the placeholder", () => {
		render(
			<TextInput
				label="Search"
				placeholder="Payee, note or amount"
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Search" });
		expect(input).toHaveAttribute("placeholder", "Payee, note or amount");
		expect(screen.getByText("Search").tagName).toBe("LABEL");
	});
});

describe("value", () => {
	test("passes what the user types to onChange as text", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<TextInput
				label="Description"
				onChange={onChange}
			/>,
		);

		await user.type(
			screen.getByRole("textbox", { name: "Description" }),
			"Rent",
		);

		expect(onChange).toHaveBeenCalledTimes(4);
		expect(onChange).toHaveBeenLastCalledWith("Rent");
	});

	test("starts with a default value and lets the user change it", async () => {
		const user = userEvent.setup();
		render(
			<TextInput
				label="Description"
				defaultValue="Rent"
			/>,
		);
		const input = screen.getByRole("textbox", { name: "Description" });
		expect(input).toHaveValue("Rent");

		await user.type(input, " 2026");

		expect(input).toHaveValue("Rent 2026");
	});

	test("is controlled: it shows the value it is given, and the parent decides", async () => {
		const user = userEvent.setup();
		function Controlled() {
			const [value, setValue] = useState("");
			return (
				<TextInput
					label="Code"
					value={value}
					onChange={(next) => setValue(next.toUpperCase())}
				/>
			);
		}
		render(<Controlled />);

		await user.type(screen.getByRole("textbox", { name: "Code" }), "abc");

		expect(screen.getByRole("textbox", { name: "Code" })).toHaveValue("ABC");
	});

	test("ignores typing when a controlled value is not updated", async () => {
		const user = userEvent.setup();
		render(
			<TextInput
				label="Code"
				value="fixed"
				onChange={() => {}}
			/>,
		);

		await user.type(screen.getByRole("textbox", { name: "Code" }), "x");

		expect(screen.getByRole("textbox", { name: "Code" })).toHaveValue("fixed");
	});

	test("takes a pasted value and clears back to empty", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<TextInput
				label="Payee"
				onChange={onChange}
			/>,
		);
		const input = screen.getByRole("textbox", { name: "Payee" });

		await user.click(input);
		await user.paste("Chai Point");
		expect(onChange).toHaveBeenLastCalledWith("Chai Point");

		await user.clear(input);
		expect(onChange).toHaveBeenLastCalledWith("");
	});

	test("stops at maxLength", async () => {
		const user = userEvent.setup();
		render(
			<TextInput
				label="Code"
				maxLength={3}
			/>,
		);

		await user.type(screen.getByRole("textbox", { name: "Code" }), "abcdef");

		expect(screen.getByRole("textbox", { name: "Code" })).toHaveValue("abc");
	});
});

describe("input attributes", () => {
	test("passes name, type, autocomplete, input mode and id to the input", () => {
		render(
			<TextInput
				label="Email"
				name="email"
				type="email"
				autoComplete="email"
				inputMode="email"
				id="email-field"
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Email" });
		expect(input).toHaveAttribute("name", "email");
		expect(input).toHaveAttribute("type", "email");
		expect(input).toHaveAttribute("autocomplete", "email");
		expect(input).toHaveAttribute("inputmode", "email");
		expect(input).toHaveAttribute("id", "email-field");
	});

	test("can be a password field", () => {
		render(
			<TextInput
				label="Password"
				type="password"
			/>,
		);

		expect(screen.getByLabelText("Password")).toHaveAttribute(
			"type",
			"password",
		);
	});

	test("takes its value into a submitted form under its name", () => {
		const onSubmit = vi.fn((event: React.SubmitEvent<HTMLFormElement>) => {
			event.preventDefault();
			return new FormData(event.currentTarget).get("payee");
		});
		render(
			<form onSubmit={onSubmit}>
				<TextInput
					label="Payee"
					name="payee"
					defaultValue="Chai Point"
				/>
				<button type="submit">Go</button>
			</form>,
		);

		fireEvent.submit(
			screen.getByRole("button", { name: "Go" }).closest("form")!,
		);

		expect(onSubmit.mock.results[0]?.value).toBe("Chai Point");
	});

	test("can take focus on render", () => {
		render(
			<TextInput
				label="Payee"
				autoFocus
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Payee" })).toHaveFocus();
	});

	test("reports focus and blur", async () => {
		const user = userEvent.setup();
		const onFocus = vi.fn();
		const onBlur = vi.fn();
		render(
			<>
				<TextInput
					label="Payee"
					onFocus={onFocus}
					onBlur={onBlur}
				/>
				<button>Other</button>
			</>,
		);

		await user.tab();
		await user.tab();

		expect(onFocus).toHaveBeenCalledOnce();
		expect(onBlur).toHaveBeenCalledOnce();
	});

	test("reports key presses", async () => {
		const user = userEvent.setup();
		const onKeyDown = vi.fn();
		render(
			<TextInput
				label="Payee"
				onKeyDown={onKeyDown}
			/>,
		);

		await user.type(screen.getByRole("textbox", { name: "Payee" }), "a{Enter}");

		expect(onKeyDown).toHaveBeenCalledTimes(2);
	});
});

describe("single and multiple lines", () => {
	test("a single line is an input that Enter does not break", async () => {
		const user = userEvent.setup();
		render(<TextInput label="Payee" />);

		const input = screen.getByRole("textbox", { name: "Payee" });
		await user.type(input, "a{Enter}b");

		expect(input.tagName).toBe("INPUT");
		expect(input).toHaveValue("ab");
	});

	test("multiline is a text area with three rows, and Enter starts a new line", async () => {
		const user = userEvent.setup();
		render(
			<TextInput
				label="Note"
				multiline
			/>,
		);

		const area = screen.getByRole("textbox", { name: "Note" });
		await user.type(area, "a{Enter}b");

		expect(area.tagName).toBe("TEXTAREA");
		expect(area).toHaveAttribute("rows", "3");
		expect(area).toHaveValue("a\nb");
	});

	test("multiline takes a row count, a placeholder, and can be stretched", () => {
		render(
			<TextInput
				label="Note"
				multiline
				rows={6}
				placeholder="Anything to remember"
			/>,
		);

		const area = screen.getByRole("textbox", { name: "Note" });
		expect(area).toHaveAttribute("rows", "6");
		expect(area).toHaveAttribute("placeholder", "Anything to remember");
		expect(area).toHaveClass("resize-y");
	});

	test("multiline aligns its icon to the first line", () => {
		render(
			<TextInput
				label="Note"
				multiline
				icon={Search}
			/>,
		);

		expect(
			screen.getByRole("textbox", { name: "Note" }).parentElement,
		).toHaveClass("items-start");
	});

	test("a single line centres its content and is 42px, or 44px on phones", () => {
		render(<TextInput label="Payee" />);

		expect(
			screen.getByRole("textbox", { name: "Payee" }).parentElement,
		).toHaveClass("items-center", "min-h-10.5", "max-md:min-h-11");
	});
});

describe("icon", () => {
	test("shows a decorative icon before the text", () => {
		render(
			<TextInput
				label="Search"
				icon={Search}
			/>,
		);

		const icon = screen
			.getByRole("textbox", { name: "Search" })
			.parentElement?.querySelector("svg");
		expect(icon).toHaveAttribute("aria-hidden", "true");
	});

	test("has none unless given", () => {
		render(<TextInput label="Search" />);

		expect(
			screen
				.getByRole("textbox", { name: "Search" })
				.parentElement?.querySelector("svg"),
		).toBeNull();
	});
});

describe("optional and counter", () => {
	test("shows the optional mark and the counter", () => {
		render(
			<TextInput
				label="Description"
				optional
				counter="31 / 500"
			/>,
		);

		expect(screen.getByText("(optional)")).toBeVisible();
		expect(screen.getByText("31 / 500")).toBeVisible();
	});

	test("updates the counter as the parent changes it", async () => {
		const user = userEvent.setup();
		function WithCounter() {
			const [value, setValue] = useState("");
			return (
				<TextInput
					label="Description"
					value={value}
					onChange={setValue}
					counter={`${value.length} / 500`}
				/>
			);
		}
		render(<WithCounter />);

		await user.type(
			screen.getByRole("textbox", { name: "Description" }),
			"Rent",
		);

		expect(screen.getByText("4 / 500")).toBeVisible();
	});
});

describe("hint and error", () => {
	test("reads the hint with the input", () => {
		render(
			<TextInput
				label="Description"
				hint="Shown under the payee in your list."
			/>,
		);

		expect(
			screen.getByRole("textbox", { name: "Description" }),
		).toHaveAccessibleDescription("Shown under the payee in your list.");
	});

	test("is valid by default", () => {
		render(<TextInput label="Description" />);

		expect(screen.getByRole("textbox", { name: "Description" })).toBeValid();
		expect(
			screen.getByRole("textbox", { name: "Description" }),
		).not.toHaveAttribute("aria-invalid");
	});

	test("marks the input invalid, reads the error instead of the hint, and draws a red edge", () => {
		render(
			<TextInput
				label="Description"
				hint="Shown under the payee in your list."
				error="Too long."
			/>,
		);

		const input = screen.getByRole("textbox", { name: "Description" });
		expect(input).toBeInvalid();
		expect(input).toHaveAccessibleDescription("Too long.");
		expect(
			screen.queryByText("Shown under the payee in your list."),
		).not.toBeInTheDocument();
		expect(input.parentElement).toHaveClass("invalid:border-neg");
		expect(input.parentElement).toHaveAttribute("data-invalid", "true");
	});

	test("shows the error for a multiline box too", () => {
		render(
			<TextInput
				label="Note"
				multiline
				error="Too long."
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Note" })).toBeInvalid();
		expect(
			screen.getByRole("textbox", { name: "Note" }),
		).toHaveAccessibleDescription("Too long.");
	});

	test("clears the error and brings the hint back when the error goes", () => {
		const props: TextInputProps = { label: "Description", hint: "A hint." };
		const { rerender } = render(
			<TextInput
				{...props}
				error="Too long."
			/>,
		);

		rerender(<TextInput {...props} />);

		expect(screen.getByRole("textbox", { name: "Description" })).toBeValid();
		expect(
			screen.getByRole("textbox", { name: "Description" }),
		).toHaveAccessibleDescription("A hint.");
	});
});

describe("required and read only", () => {
	test("is marked required", () => {
		render(
			<TextInput
				label="Payee"
				isRequired
			/>,
		);

		expect(screen.getByRole("textbox", { name: /Payee/ })).toBeRequired();
	});

	test("shows a read-only value that can be focused but not changed", async () => {
		const user = userEvent.setup();
		render(
			<TextInput
				label="Payee"
				isReadOnly
				defaultValue="Chai Point"
			/>,
		);
		const input = screen.getByRole("textbox", { name: "Payee" });

		await user.tab();
		expect(input).toHaveFocus();
		await user.keyboard("x");

		expect(input).toHaveValue("Chai Point");
		expect(input).toHaveAttribute("readonly");
	});
});

describe("disabled", () => {
	test("cannot be typed in or focused, and has the soft background", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<TextInput
				label="Description"
				isDisabled
				onChange={onChange}
			/>,
		);
		const input = screen.getByRole("textbox", { name: "Description" });

		await user.type(input, "Rent");
		await user.tab();

		expect(input).toBeDisabled();
		expect(input).not.toHaveFocus();
		expect(onChange).not.toHaveBeenCalled();
		expect(input.parentElement).toHaveClass("disabled:bg-soft");
		expect(input.parentElement).toHaveAttribute("data-disabled", "true");
	});

	test("a disabled multiline box cannot be typed in", async () => {
		const user = userEvent.setup();
		render(
			<TextInput
				label="Note"
				multiline
				isDisabled
			/>,
		);

		await user.type(screen.getByRole("textbox", { name: "Note" }), "x");

		expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("");
	});

	test("still reads its hint", () => {
		render(
			<TextInput
				label="Currency"
				isDisabled
				hint="Fixed once you have data."
			/>,
		);

		expect(
			screen.getByRole("textbox", { name: "Currency" }),
		).toHaveAccessibleDescription("Fixed once you have data.");
	});
});

describe("focus ring", () => {
	test("moves to the whole box when the input is focused", async () => {
		const user = userEvent.setup();
		render(<TextInput label="Payee" />);

		await user.tab();

		const box = screen.getByRole("textbox", { name: "Payee" }).parentElement;
		expect(box).toHaveAttribute("data-focus-within", "true");
		expect(box).toHaveClass("focus-within:focus-ring");
	});

	test("goes when the input loses focus", async () => {
		const user = userEvent.setup();
		render(<TextInput label="Payee" />);
		await user.tab();

		await user.tab();

		expect(
			screen.getByRole("textbox", { name: "Payee" }).parentElement,
		).not.toHaveAttribute("data-focus-within");
	});
});

describe("text size on touch devices", () => {
	// iOS Safari zooms the whole page when an input under 16px gets focus, and does not zoom back.
	test("a single line uses 16px text on touch devices and the 15px body size with a mouse", () => {
		render(<TextInput label="Payee" />);

		expect(screen.getByRole("textbox", { name: "Payee" })).toHaveClass(
			"text-body",
			"pointer-coarse:text-base",
		);
	});

	test("a multi-line box does the same", () => {
		render(
			<TextInput
				label="Note"
				multiline
			/>,
		);

		expect(screen.getByRole("textbox", { name: "Note" })).toHaveClass(
			"text-body",
			"pointer-coarse:text-base",
		);
	});
});

describe("className", () => {
	test("goes on the root element, which holds the label, the box and the message", () => {
		const { container } = render(
			<TextInput
				label="Description"
				className="col-span-2"
			/>,
		);

		expect(container.firstElementChild).toHaveClass("col-span-2");
		expect(container.firstElementChild).toContainElement(
			screen.getByText("Description"),
		);
	});
});
