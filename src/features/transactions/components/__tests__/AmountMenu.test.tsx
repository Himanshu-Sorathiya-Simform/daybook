import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { AmountMenu, type AmountMenuProps } from "../AmountMenu";
import type { FilterLocale } from "../../lib/filter-labels";
import type { AmountBounds } from "../../lib/quick-ranges";

const IN: FilterLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

/** Check B's histogram (F03 section 5). */
const CHECK_B = {
	edges: [
		31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
		315000,
	],
	counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
};

function renderMenu(props: Partial<AmountMenuProps> = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	function Harness() {
		const [bounds, setBounds] = useState<AmountBounds>(props.bounds ?? {});
		return (
			<AmountMenu
				histogram={CHECK_B}
				isLoading={false}
				count={4}
				locale={IN}
				{...props}
				bounds={bounds}
				onChange={(next) => {
					onChange(next);
					setBounds(next);
				}}
			/>
		);
	}
	render(<Harness />);
	return { user, onChange };
}

const trigger = (name: string | RegExp = /^Amount/) =>
	screen.getByRole("button", { name, hidden: true });
const open = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(trigger());
	return screen.findByRole("dialog", { name: "Amount" });
};

describe("the trigger (BR-F03-39)", () => {
	test("reads Amount Any without bounds, not marked active", () => {
		renderMenu();

		expect(trigger("Amount Any")).not.toHaveClass("border-accent");
	});

	test("reads the amount chip's label, marked active", () => {
		renderMenu({ bounds: { minMinor: 100000, maxMinor: 250000 } });

		expect(trigger("Amount ₹1,000 to ₹2,500")).toHaveClass("border-accent");
	});

	test("reads a quick range's own name once the histogram is known", () => {
		renderMenu({ bounds: { maxMinor: 39999 } });

		expect(trigger("Amount Under ₹400")).toBeInTheDocument();
	});

	test("without the histogram the same bounds read as themselves", () => {
		renderMenu({ bounds: { maxMinor: 39999 }, histogram: undefined });

		expect(trigger("Amount Up to ₹399.99")).toBeInTheDocument();
	});
});

describe("the popover", () => {
	test("holds the amount block, with the header's count", async () => {
		const { user } = renderMenu();

		const dialog = await open(user);

		expect(dialog).toHaveTextContent("4 Transactions");
		expect(
			screen.getByRole("slider", { name: /^Minimum amount/ }),
		).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Min" })).toBeInTheDocument();
	});

	test("a quick range commits at once and keeps the popover open", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		await user.click(screen.getByRole("radio", { name: "₹2,500 and over" }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({ minMinor: 250000 });
		expect(screen.getByRole("dialog", { name: "Amount" })).toBeInTheDocument();
		expect(trigger("Amount ₹2,500 and over")).toBeInTheDocument();
	});

	test("Clear drops both bounds at once", async () => {
		const { user, onChange } = renderMenu({
			bounds: { minMinor: 40000, maxMinor: 79999 },
		});

		await open(user);
		await user.click(screen.getByRole("button", { name: "Clear" }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith({});
		expect(trigger("Amount Any")).toBeInTheDocument();
	});

	test("Clear is disabled while there is nothing to clear, and does nothing", async () => {
		const { user, onChange } = renderMenu();

		await open(user);
		const clear = screen.getByRole("button", { name: "Clear" });
		expect(clear).toHaveAttribute("aria-disabled", "true");
		await user.click(clear);

		expect(onChange).not.toHaveBeenCalled();
	});

	test("Done closes it", async () => {
		const { user } = renderMenu();

		await open(user);
		await user.click(screen.getByRole("button", { name: "Done" }));

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	test("tells the caller when it opens, for the histogram", async () => {
		const onOpenChange = vi.fn();
		const { user } = renderMenu({ onOpenChange });

		await open(user);

		expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
	});

	test("shows the placeholder while the histogram loads", async () => {
		const { user } = renderMenu({ histogram: undefined, isLoading: true });

		const dialog = await open(user);

		expect(screen.queryByRole("slider")).toBeNull();
		expect(dialog.querySelector(".h-13")).not.toBeNull();
	});
});

describe("className", () => {
	test("goes on the trigger, after its own classes", () => {
		renderMenu({ className: "ms-auto" });

		expect(trigger()).toHaveClass("inline-flex", "ms-auto");
	});
});
