import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Month } from "@/lib/budgets/months";
import type { Formats } from "../../lib/labels";
import { MonthField, type MonthFieldProps } from "../MonthField";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

/** The field as a dialog holds it, starting at the current month (BR-F04-07). */
function Host({
	onChange,
	...props
}: Partial<MonthFieldProps> & { onChange?: (month: Month) => void }) {
	const [value, setValue] = useState<Month>(props.value ?? "2026-11");
	return (
		<>
			<MonthField
				label="Apply from"
				current="2026-11"
				viewed="2026-10"
				formats={IN}
				{...props}
				value={value}
				onChange={(month) => {
					setValue(month);
					onChange?.(month);
				}}
			/>
			<button type="button">After</button>
		</>
	);
}

function renderField(props: Parameters<typeof Host>[0] = {}) {
	const onChange = vi.fn();
	const view = render(
		<Host
			onChange={onChange}
			{...props}
		/>,
	);
	return { ...view, onChange, user: userEvent.setup() };
}

const chips = () => screen.getByRole("radiogroup", { name: "Apply from" });
const chip = (name: string | RegExp) => within(chips()).getByRole("radio", { name });

describe("MonthField (BR-F04-28)", () => {
	test("its label, and chips for this month, next month, the viewed month and Other month", () => {
		renderField();
		expect(screen.getByText("Apply from")).toBeVisible();
		expect(
			within(chips())
				.getAllByRole("radio")
				.map((each) => each.textContent),
		).toEqual([
			"This month (November)",
			"Next month (December)",
			"October (viewing)",
			"Other month",
		]);
	});

	test("starts on the value's chip", () => {
		renderField();
		expect(chip("This month (November)")).toHaveAttribute(
			"aria-checked",
			"true",
		);
	});

	test("a chip picks its month", async () => {
		const { user, onChange } = renderField();
		await user.click(chip("October (viewing)"));
		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-10");
		expect(chip("October (viewing)")).toHaveAttribute("aria-checked", "true");
	});

	test("Other month opens the month grid in a popover, without figures, captioned with the range", async () => {
		const { user, container } = renderField();
		await user.click(chip("Other month"));
		const popover = screen.getByRole("dialog", { name: "Other month" });
		expect(within(popover).getByRole("listbox")).toBeVisible();
		expect(
			within(popover).getByText("From Nov 2023 to Nov 2027."),
		).toBeVisible();
		// Over the field, not inside it, so nothing around it moves.
		expect(container.contains(popover)).toBe(false);
		expect(
			within(
				screen.getByRole("radiogroup", { name: "Apply from", hidden: true }),
			).getByRole("radio", { name: "Other month", hidden: true }),
		).toHaveAttribute("aria-checked", "true");
	});

	test("a press outside closes the popover and keeps the month", async () => {
		const { user, onChange } = renderField();
		await user.click(chip("Other month"));
		await user.click(document.body);
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Other month" }),
			).not.toBeInTheDocument(),
		);
		expect(onChange).not.toHaveBeenCalled();
		expect(chip("This month (November)")).toHaveAttribute(
			"aria-checked",
			"true",
		);
	});

	test("a month picked in the grid closes it and shows as its own chosen chip, with focus on it", async () => {
		const { user, onChange } = renderField();
		await user.click(chip("Other month"));
		await user.click(screen.getByRole("option", { name: /February/ }));
		expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-02");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(chip("February")).toHaveAttribute("aria-checked", "true");
		await waitFor(() => expect(chip("February")).toHaveFocus());
	});

	test("Escape in the grid closes it alone, keeps the month, and returns focus to its chip", async () => {
		const onKeyDown = vi.fn();
		const { user, onChange } = render(
			<div onKeyDown={(event) => onKeyDown(event.key)}>
				<Host />
			</div>,
		) && { user: userEvent.setup(), onChange: vi.fn() };
		await user.click(chip("Other month"));
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(onKeyDown).not.toHaveBeenCalledWith("Escape");
		expect(onChange).not.toHaveBeenCalled();
		expect(chip("This month (November)")).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await waitFor(() => expect(chip("This month (November)")).toHaveFocus());
	});

	test("other keys in the grid pass on", async () => {
		const onKeyDown = vi.fn();
		render(
			<div onKeyDown={(event) => onKeyDown(event.key)}>
				<Host />
			</div>,
		);
		const user = userEvent.setup();
		await user.click(chip("Other month"));
		await user.keyboard("{Tab}");
		expect(screen.getByRole("listbox")).toBeVisible();
		expect(onKeyDown).toHaveBeenCalledWith("Tab");
	});

	test("the grid disables months outside the range", async () => {
		const { user } = renderField();
		await user.click(chip("Other month"));
		await user.click(screen.getByRole("button", { name: /Previous year/ }));
		await user.click(screen.getByRole("button", { name: /Previous year/ }));
		await user.click(screen.getByRole("button", { name: /Previous year/ }));
		expect(screen.getByRole("option", { name: /October/ })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(screen.getByRole("option", { name: /November/ })).not.toHaveAttribute(
			"aria-disabled",
		);
	});

	test("disabled, no chip picks", async () => {
		const { user, onChange } = renderField({ isDisabled: true });
		await user.click(chip("October (viewing)"));
		expect(onChange).not.toHaveBeenCalled();
	});

	test("takes the caller's classes", () => {
		const { container } = renderField({ className: "mt-2" });
		expect(container.firstElementChild).toHaveClass("flex", "mt-2");
	});
});
