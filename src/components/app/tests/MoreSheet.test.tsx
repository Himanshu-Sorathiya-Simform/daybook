import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { describe, expect, test, vi } from "vitest";

import { MoreSheet, type MoreSheetProps } from "../MoreSheet";

const MORE = [
	"Subscriptions",
	"Goals",
	"Investments",
	"Analytics",
	"Insights",
	"Reports",
	"Learn",
	"Settings",
];

function renderSheet(props: Partial<MoreSheetProps> = {}) {
	const onOpenChange = vi.fn();
	const navigate = vi.fn();
	render(
		<AriaRouterProvider navigate={navigate}>
			<MoreSheet
				pathname="/transactions"
				isOpen
				onOpenChange={onOpenChange}
				{...props}
			/>
		</AriaRouterProvider>,
	);
	return { onOpenChange, navigate };
}

describe("MoreSheet (root section 4)", () => {
	test("closed, shows nothing", () => {
		renderSheet({ isOpen: false });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("is a dialog titled More, with a More navigation inside", () => {
		renderSheet();
		const dialog = screen.getByRole("dialog", { name: "More" });
		expect(
			within(dialog).getByRole("navigation", { name: "More" }),
		).toBeInTheDocument();
	});

	test("lists the rest in the sidebar's order, Settings last", () => {
		renderSheet();
		const nav = screen.getByRole("navigation", { name: "More" });
		expect(
			within(nav)
				.getAllByRole("link")
				.map((link) => link.textContent),
		).toEqual(MORE);
	});

	test("marks the current page, a page under it included", () => {
		renderSheet({ pathname: "/settings/profile" });
		const nav = screen.getByRole("navigation", { name: "More" });
		expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(within(nav).getByRole("link", { name: "Goals" })).not.toHaveAttribute(
			"aria-current",
		);
	});

	test("choosing a destination navigates and closes the sheet", async () => {
		const user = userEvent.setup();
		const { onOpenChange, navigate } = renderSheet();
		await user.click(screen.getByRole("link", { name: "Reports" }));
		expect(navigate).toHaveBeenCalledWith("/reports", undefined);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test("Enter on a destination does the same", async () => {
		const user = userEvent.setup();
		const { onOpenChange, navigate } = renderSheet();
		screen.getByRole("link", { name: "Learn" }).focus();
		await user.keyboard("{Enter}");
		expect(navigate).toHaveBeenCalledWith("/learn", undefined);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test("Escape closes it", async () => {
		const user = userEvent.setup();
		const { onOpenChange } = renderSheet();
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test("a press outside the sheet closes it", async () => {
		const user = userEvent.setup();
		const { onOpenChange } = renderSheet();
		const overlay = screen.getByRole("dialog").closest(".bg-scrim");
		expect(overlay).not.toBeNull();
		await user.click(overlay as HTMLElement);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test("has a Close button", async () => {
		const user = userEvent.setup();
		const { onOpenChange } = renderSheet();
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
