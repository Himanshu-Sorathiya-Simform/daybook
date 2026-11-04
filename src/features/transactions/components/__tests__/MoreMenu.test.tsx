import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { MoreMenu, type MoreMenuProps } from "../MoreMenu";

function renderMenu(props: Partial<MoreMenuProps> = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [value, setValue] = useState(props.value);
		return (
			<MoreMenu
				{...props}
				value={value}
				onChange={(next) => {
					onChange(next);
					setValue(next);
				}}
			/>
		);
	}
	render(<Harness />);
	return { user, onChange };
}

const trigger = (name: string | RegExp = /^More/) =>
	screen.getByRole("button", { name, hidden: true });
const open = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(trigger());
	return screen.findByRole("dialog", { name: "More" });
};
const radio = (name: string) =>
	screen.getByRole("radio", { name: new RegExp(`^${name}( \\d+)?$`) });

describe("the trigger (BR-F03-39)", () => {
	test("reads More alone with any source", () => {
		renderMenu();

		expect(trigger("More")).not.toHaveClass("border-accent");
	});

	test("reads More 1 with a source chosen, marked active", () => {
		renderMenu({ value: "manual" });

		expect(trigger("More 1")).toHaveClass("border-accent");
	});
});

describe("Source", () => {
	test("offers Any source, Added by you and Subscription charges", async () => {
		const { user } = renderMenu();

		const dialog = await open(user);

		expect(
			within(dialog)
				.getAllByRole("radio")
				.map((each) => each.closest("label")!.textContent),
		).toEqual(["Any source", "Added by you", "Subscription charges"]);
		expect(radio("Any source")).toBeChecked();
	});

	// AC-F03-40
	test("shows each source's count, and Any source counts both", async () => {
		const { user } = renderMenu({ counts: { manual: 4, subscription: 2 } });

		await open(user);

		expect(radio("Any source").closest("label")).toHaveTextContent(
			"Any source 6",
		);
		expect(radio("Added by you").closest("label")).toHaveTextContent(
			"Added by you 4",
		);
		expect(radio("Subscription charges").closest("label")).toHaveTextContent(
			"Subscription charges 2",
		);
	});

	test("check B's source counts read 4 and 0", async () => {
		const { user } = renderMenu({ counts: { manual: 4, subscription: 0 } });

		await open(user);

		expect(radio("Subscription charges").closest("label")).toHaveTextContent(
			"Subscription charges 0",
		);
	});

	test("shows no counts before they arrive", async () => {
		const { user } = renderMenu();

		await open(user);

		expect(radio("Added by you").closest("label")).toHaveTextContent(
			/^Added by you$/,
		);
	});

	test("choosing a source commits it at once and keeps the popover open", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(radio("Subscription charges"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith("subscription");
		expect(screen.getByRole("dialog", { name: "More" })).toBeInTheDocument();
		expect(trigger("More 1")).toBeInTheDocument();
	});

	test("Any source drops the filter", async () => {
		const { user, onChange } = renderMenu({ value: "manual" });

		await open(user);
		await user.click(radio("Any source"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
	});

	test("the arrow keys move and choose", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.keyboard("{Tab}{ArrowDown}");

		expect(onChange).toHaveBeenLastCalledWith("manual");
	});

	test("tells the caller when it opens", async () => {
		const onOpenChange = vi.fn();
		const { user } = renderMenu({ onOpenChange });

		await open(user);

		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
	});
});

describe("className", () => {
	test("goes on the trigger, after its own classes", () => {
		renderMenu({ className: "ms-auto" });

		expect(trigger()).toHaveClass("inline-flex", "ms-auto");
	});
});
