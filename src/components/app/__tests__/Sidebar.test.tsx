import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { describe, expect, test, vi } from "vitest";

import { Sidebar, type SidebarProps } from "../Sidebar";

const ORDER = [
	"Dashboard",
	"Transactions",
	"Budgets",
	"Subscriptions",
	"Goals",
	"Investments",
	"Analytics",
	"Insights",
	"Reports",
	"Learn",
	"Settings",
];

function renderSidebar(props: Partial<SidebarProps> = {}) {
	const onRailChange = vi.fn();
	const navigate = vi.fn();
	const view = render(
		<AriaRouterProvider navigate={navigate}>
			<Sidebar
				pathname="/transactions"
				rail={false}
				onRailChange={onRailChange}
				{...props}
			/>
		</AriaRouterProvider>,
	);
	const nav = screen.getByRole("navigation", { name: "Main" });
	return { ...view, nav, onRailChange, navigate };
}

const linkNames = (nav: HTMLElement) =>
	within(nav)
		.getAllByRole("link")
		.map((link) => link.getAttribute("aria-label") ?? link.textContent);

describe.each([
	["full width", false],
	["the rail", true],
])("Sidebar in %s", (_name, rail) => {
	test("is the Main navigation landmark", () => {
		const { nav } = renderSidebar({ rail });
		expect(nav.tagName).toBe("NAV");
	});

	test("lists the destinations in the root spec's order, Settings last", () => {
		const { nav } = renderSidebar({ rail });
		expect(linkNames(nav)).toEqual(ORDER);
		for (const name of ORDER)
			expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
	});

	test("each link opens its route", () => {
		const { nav } = renderSidebar({ rail });
		expect(within(nav).getByRole("link", { name: "Budgets" })).toHaveAttribute(
			"href",
			"/budgets",
		);
		expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute(
			"href",
			"/settings",
		);
	});

	test("marks only the current page", () => {
		const { nav } = renderSidebar({ rail, pathname: "/budgets" });
		const current = within(nav)
			.getAllByRole("link")
			.filter((link) => link.getAttribute("aria-current") === "page");
		expect(current).toHaveLength(1);
		expect(current[0]).toHaveAttribute("href", "/budgets");
	});

	test("a page under a destination marks that destination", () => {
		const { nav } = renderSidebar({ rail, pathname: "/settings/profile" });
		expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("a look-alike path marks nothing", () => {
		const { nav } = renderSidebar({ rail, pathname: "/goalsx" });
		for (const link of within(nav).getAllByRole("link"))
			expect(link).not.toHaveAttribute("aria-current");
	});

	test("a group's first item has the gap before it, and no other item does", () => {
		const { nav } = renderSidebar({ rail });
		const gapped = within(nav)
			.getAllByRole("link")
			.filter((link) => link.className.split(" ").includes("mt-3.5"))
			.map((link) => link.getAttribute("href"));
		expect(gapped).toEqual(["/goals", "/analytics", "/learn"]);
	});

	test("the width toggle comes after Settings", () => {
		const { nav } = renderSidebar({ rail });
		const settings = within(nav).getByRole("link", { name: "Settings" });
		const toggle = within(nav).getByRole("button");
		expect(
			settings.compareDocumentPosition(toggle)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("a link navigates through the router", async () => {
		const user = userEvent.setup();
		const { nav, navigate } = renderSidebar({ rail });
		await user.click(within(nav).getByRole("link", { name: "Goals" }));
		expect(navigate).toHaveBeenCalledWith("/goals", undefined);
	});

	test("takes a class name for its root", () => {
		const { nav } = renderSidebar({ rail, className: "max-md:hidden" });
		expect(nav).toHaveClass("max-md:hidden");
	});
});

describe("Sidebar width (D-513)", () => {
	test("full width shows the name and every label as text", () => {
		const { nav } = renderSidebar();
		expect(nav).toHaveClass("w-(--sidebar-width)");
		expect(nav).toHaveTextContent(/^Daybook/);
		const goals = within(nav).getByRole("link", { name: "Goals" });
		expect(goals).toHaveTextContent("Goals");
		expect(goals).not.toHaveAttribute("aria-label");
	});

	test("the rail names each link without visible text", () => {
		const { nav } = renderSidebar({ rail: true });
		expect(nav).toHaveClass("w-(--rail-width)");
		const goals = within(nav).getByRole("link", { name: "Goals" });
		expect(goals).toHaveAttribute("aria-label", "Goals");
		expect(goals).toHaveTextContent("");
	});

	test("the rail shows D, and still says Daybook to a screen reader", () => {
		const { nav } = renderSidebar({ rail: true });
		const name = nav.querySelector("p");
		expect(name?.querySelector('[aria-hidden="true"]')).toHaveTextContent("D");
		expect(name?.querySelector(".sr-only")).toHaveTextContent("Daybook");
	});

	test("full width offers Collapse sidebar, which asks for the rail", async () => {
		const user = userEvent.setup();
		const { nav, onRailChange } = renderSidebar();
		const toggle = within(nav).getByRole("button", { name: "Collapse sidebar" });
		expect(toggle).toHaveTextContent("Collapse sidebar");
		await user.click(toggle);
		expect(onRailChange).toHaveBeenCalledExactlyOnceWith(true);
	});

	test("the rail offers Expand sidebar, which asks for full width", async () => {
		const user = userEvent.setup();
		const { nav, onRailChange } = renderSidebar({ rail: true });
		const toggle = within(nav).getByRole("button", { name: "Expand sidebar" });
		expect(toggle).toHaveTextContent("");
		await user.click(toggle);
		expect(onRailChange).toHaveBeenCalledExactlyOnceWith(false);
	});

	test.each(["{Enter}", " "])(
		"the toggle works from the keyboard with %s",
		async (key) => {
			const user = userEvent.setup();
			const { nav, onRailChange } = renderSidebar();
			within(nav).getByRole("button", { name: "Collapse sidebar" }).focus();
			await user.keyboard(key);
			expect(onRailChange).toHaveBeenCalledExactlyOnceWith(true);
		},
	);

	test("Tab walks the links in order, then the toggle", async () => {
		const user = userEvent.setup();
		const { nav } = renderSidebar();
		for (const name of ORDER) {
			await user.tab();
			expect(within(nav).getByRole("link", { name })).toHaveFocus();
		}
		await user.tab();
		expect(
			within(nav).getByRole("button", { name: "Collapse sidebar" }),
		).toHaveFocus();
	});

	test("in the rail, keyboard focus shows a link's label as a tooltip", async () => {
		const user = userEvent.setup();
		renderSidebar({ rail: true });
		await user.tab();
		expect(await screen.findByRole("tooltip")).toHaveTextContent("Dashboard");
	});

	test("in the rail, the toggle's label is a tooltip too", async () => {
		const user = userEvent.setup();
		const { nav } = renderSidebar({ rail: true });
		for (let step = 0; step <= ORDER.length; step++) await user.tab();
		expect(
			within(nav).getByRole("button", { name: "Expand sidebar" }),
		).toHaveFocus();
		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Expand sidebar",
		);
	});

	test("full width shows no tooltips", async () => {
		const user = userEvent.setup();
		renderSidebar();
		await user.tab();
		await user.hover(screen.getByRole("link", { name: "Transactions" }));
		// Longer than the tooltip's 500 ms delay.
		await new Promise((resolve) => setTimeout(resolve, 700));
		expect(screen.queryByRole("tooltip")).toBeNull();
	});
});

/** The sidebar with its width kept in state, as the shell keeps it. */
function Stateful({ rail: start = false }: { rail?: boolean }) {
	const [rail, setRail] = useState(start);
	return (
		<Sidebar
			pathname="/transactions"
			rail={rail}
			onRailChange={setRail}
		/>
	);
}

test("at full width the toggle shows its label as text, with no tooltip", async () => {
	const user = userEvent.setup();
	renderSidebar();
	const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
	toggle.focus();
	await user.hover(toggle);
	// Longer than the tooltip's 500 ms delay.
	await new Promise((resolve) => setTimeout(resolve, 700));
	expect(screen.queryByRole("tooltip")).toBeNull();
});

describe("the width toggle keeps keyboard focus", () => {
	test.each([
		[false, "Collapse sidebar", "Expand sidebar"],
		[true, "Expand sidebar", "Collapse sidebar"],
	])(
		"from rail=%s, pressing %s leaves focus on %s",
		async (rail, before, after) => {
			const user = userEvent.setup();
			render(<Stateful rail={rail} />);
			screen.getByRole("button", { name: before }).focus();
			await user.keyboard("{Enter}");
			expect(screen.getByRole("button", { name: after })).toHaveFocus();
		},
	);

	test("the toggle is the same element in both widths", async () => {
		const user = userEvent.setup();
		render(<Stateful />);
		const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
		await user.click(toggle);
		expect(screen.getByRole("button", { name: "Expand sidebar" })).toBe(toggle);
	});
});
