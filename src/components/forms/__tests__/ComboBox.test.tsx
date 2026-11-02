import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { ComboBox, type ComboBoxProps } from "@/components/forms/ComboBox";

const OPTIONS = [
	{ value: "CI", label: "Côte d’Ivoire" },
	{ value: "IN", label: "India" },
	{ value: "GB", label: "United Kingdom" },
	{ value: "US", label: "United States" },
];

type Props = Partial<ComboBoxProps>;

function Controlled(props: Props) {
	const [value, setValue] = useState<string | null>(props.value ?? null);
	return (
		<>
			<ComboBox
				label="Country"
				options={OPTIONS}
				emptyMessage="No countries match."
				{...props}
				value={value}
				onChange={(next) => {
					setValue(next);
					props.onChange?.(next);
				}}
			/>
			<p>chosen {value ?? "none"}</p>
		</>
	);
}

const input = () => screen.getByRole("combobox", { name: "Country" });
const listedNames = () =>
	within(screen.getByRole("listbox"))
		.getAllByRole("option")
		.map((option) => option.textContent);

describe("ComboBox", () => {
	test("is a labelled combobox showing the chosen option's label", () => {
		render(<Controlled value="IN" />);
		expect(input()).toHaveValue("India");
	});

	test("is empty with nothing chosen, and shows its placeholder", () => {
		render(<Controlled placeholder="Start typing a country" />);
		expect(input()).toHaveValue("");
		expect(input()).toHaveAttribute("placeholder", "Start typing a country");
	});

	test("the button lists every option, in the given order", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.click(screen.getByRole("button"));
		expect(listedNames()).toEqual([
			"Côte d’Ivoire",
			"India",
			"United Kingdom",
			"United States",
		]);
	});

	test("typing keeps the options whose label contains the text, ignoring case", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "UNITED");
		expect(listedNames()).toEqual(["United Kingdom", "United States"]);
	});

	test("matches inside a label, not only at its start", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "kingdom");
		expect(listedNames()).toEqual(["United Kingdom"]);
	});

	test("ignores accents", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "cote");
		expect(listedNames()).toEqual(["Côte d’Ivoire"]);
	});

	test("says so when nothing matches, and lists no option", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "zzz");
		expect(screen.getByText("No countries match.")).toBeInTheDocument();
		for (const { label } of OPTIONS) {
			expect(
				screen.queryByRole("option", { name: label }),
			).not.toBeInTheDocument();
		}
	});

	test("choosing with the pointer sets the value and the text", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);
		await user.type(input(), "ind");
		await user.click(screen.getByRole("option", { name: "India" }));
		expect(onChange).toHaveBeenLastCalledWith("IN");
		expect(input()).toHaveValue("India");
		expect(screen.getByText("chosen IN")).toBeInTheDocument();
	});

	test("choosing with the keyboard: type, arrow down, Enter", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.tab();
		expect(input()).toHaveFocus();
		await user.keyboard("united{ArrowDown}{ArrowDown}{Enter}");
		expect(screen.getByText("chosen US")).toBeInTheDocument();
		expect(input()).toHaveValue("United States");
	});

	test("Escape closes the list and keeps the chosen option", async () => {
		const user = userEvent.setup();
		render(<Controlled value="IN" />);
		await user.click(screen.getByRole("button"));
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(screen.getByText("chosen IN")).toBeInTheDocument();
	});

	test("text that matches no option goes back to the chosen label when focus leaves", async () => {
		const user = userEvent.setup();
		render(<Controlled value="IN" />);
		await user.type(input(), "lantis");
		await user.tab();
		expect(input()).toHaveValue("India");
		expect(screen.getByText("chosen IN")).toBeInTheDocument();
	});

	test("clearing the box reports that nothing is chosen", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				value="IN"
				onChange={onChange}
			/>,
		);
		await user.clear(input());
		expect(onChange).toHaveBeenLastCalledWith(null);
	});

	test("marks the chosen option in the list", async () => {
		const user = userEvent.setup();
		render(<Controlled value="GB" />);
		await user.click(screen.getByRole("button"));
		expect(
			screen.getByRole("option", { name: "United Kingdom" }),
		).toHaveAttribute("aria-selected", "true");
	});

	test("the hint describes the box", () => {
		render(<Controlled hint="It can't be changed later." />);
		expect(input()).toHaveAccessibleDescription("It can't be changed later.");
	});

	test("an error replaces the hint, marks the box invalid and is read with it", () => {
		render(
			<Controlled
				hint="It can't be changed later."
				error="Choose your country."
			/>,
		);
		expect(input()).toHaveAttribute("aria-invalid", "true");
		expect(input()).toHaveAccessibleDescription("Choose your country.");
		expect(
			screen.queryByText("It can't be changed later."),
		).not.toBeInTheDocument();
	});

	test("disabled, neither the box nor the button can be used", async () => {
		const user = userEvent.setup();
		render(<Controlled isDisabled />);
		expect(input()).toBeDisabled();
		await user.click(screen.getByRole("button"));
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	test("is 44px tall on phones and 16px text on touch screens", () => {
		render(<Controlled />);
		expect(input().parentElement).toHaveClass("max-md:min-h-11");
		expect(input()).toHaveClass("pointer-coarse:text-base");
		expect(screen.getByRole("button")).toHaveClass("max-md:size-11");
	});

	test("adds the caller's classes to its root", () => {
		render(<Controlled className="max-w-xs" />);
		expect(input().closest(".flex.flex-col.max-w-xs")).not.toBeNull();
	});

	test("the button has an accessible name from React Aria", () => {
		render(<Controlled />);
		expect(screen.getByRole("button")).toHaveAccessibleName();
	});
});
