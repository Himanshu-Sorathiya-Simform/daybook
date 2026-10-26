import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Segmented, type SegmentedProps } from "@/components/forms/Segmented";

function Controlled(props: Partial<SegmentedProps>) {
	const [value, setValue] = useState("Daily");
	return (
		<Segmented
			label="Strip view"
			options={["Daily", "Pace", "Weekly"]}
			value={value}
			onChange={(next) => {
				setValue(next);
				props.onChange?.(next);
			}}
			{...(props.isDisabled ? { isDisabled: true } : {})}
		/>
	);
}

describe("default", () => {
	test("is a radio group with one selected option", () => {
		render(<Controlled />);

		expect(
			screen.getByRole("radiogroup", { name: "Strip view" }),
		).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "Daily" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Pace" })).not.toBeChecked();
	});

	test("selects an option on click", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByRole("radio", { name: "Pace" }));

		expect(onChange).toHaveBeenCalledWith("Pace");
		expect(screen.getByRole("radio", { name: "Pace" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Daily" })).not.toBeChecked();
	});

	test("uses an option's label and keeps its value", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Segmented
				label="Type"
				options={[
					{ value: "to_goal", label: "To Goal" },
					{ value: "from_goal", label: "From Goal" },
				]}
				value="to_goal"
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: "From Goal" }));

		expect(onChange).toHaveBeenCalledWith("from_goal");
	});

	test("never ends up with nothing selected", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.click(screen.getByRole("radio", { name: "Daily" }));

		expect(screen.getByRole("radio", { name: "Daily" })).toBeChecked();
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("keyboard", () => {
	test("Tab enters the group once and the arrow keys move the selection", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);

		await user.tab();
		expect(screen.getByRole("radio", { name: "Daily" })).toHaveFocus();

		await user.keyboard("{ArrowRight}");
		expect(screen.getByRole("radio", { name: "Pace" })).toHaveFocus();
		await user.keyboard(" ");

		expect(onChange).toHaveBeenCalledWith("Pace");
		expect(screen.getByRole("radio", { name: "Pace" })).toBeChecked();
	});
});

describe("disabled", () => {
	test("cannot be changed", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Controlled
				isDisabled
				onChange={onChange}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: "Pace" }));

		expect(screen.getByRole("radio", { name: "Pace" })).toBeDisabled();
		expect(onChange).not.toHaveBeenCalled();
	});
});
