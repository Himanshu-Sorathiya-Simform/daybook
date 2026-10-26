import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutDashboard } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import { NavItem, type NavItemProps } from "@/components/navigation/NavItem";

function renderItem(props: Partial<NavItemProps> = {}) {
	return render(
		<NavItem
			label="Dashboard"
			icon={LayoutDashboard}
			href="/dashboard"
			{...props}
		/>,
	);
}

describe("link", () => {
	test("is a link to its page, named by its label", () => {
		renderItem();

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
			"href",
			"/dashboard",
		);
	});

	test("shows the label and a decorative icon in front of it", () => {
		renderItem();

		const link = screen.getByRole("link", { name: "Dashboard" });
		expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
		expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
		expect(link).toHaveTextContent("Dashboard");
	});

	test("is reached with Tab and shows keyboard focus", async () => {
		const user = userEvent.setup();
		renderItem();

		await user.tab();

		const link = screen.getByRole("link", { name: "Dashboard" });
		expect(link).toHaveFocus();
		expect(link).toHaveAttribute("data-focus-visible", "true");
	});

	test("reports a press with the mouse and with Enter", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		renderItem({ onPress });

		await user.click(screen.getByRole("link", { name: "Dashboard" }));
		await user.keyboard("{Enter}");

		expect(onPress).toHaveBeenCalledTimes(2);
	});

	test("goes through a passed target and rel", () => {
		renderItem({ target: "_blank", rel: "noopener" });

		const link = screen.getByRole("link", { name: "Dashboard" });
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener");
	});

	test("marks itself hovered under the pointer", async () => {
		const user = userEvent.setup();
		renderItem();

		await user.hover(screen.getByRole("link", { name: "Dashboard" }));

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
			"data-hovered",
			"true",
		);
	});

	test("takes the caller's classes, such as a gap before a new group", () => {
		renderItem({ className: "mt-3.5" });

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
			"mt-3.5",
			"h-10",
		);
	});

	test("is 40px tall and 44px on phones", () => {
		renderItem();

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
			"h-10",
			"max-md:min-h-11",
		);
	});
});

describe("current page", () => {
	test("marks itself as the current page", () => {
		renderItem({ active: true });

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("is not the current page by default", () => {
		renderItem();

		expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
			"aria-current",
		);
	});

	test("shows a soft fill, bold ink text and a lapis icon, with no coloured edge", () => {
		renderItem({ active: true });

		const link = screen.getByRole("link", { name: "Dashboard" });
		expect(link).toHaveClass("bg-soft", "font-semibold", "text-ink");
		expect(link.querySelector("svg")).toHaveClass("text-accent");
		expect(link.className).not.toMatch(/border-l|border-accent/);
	});

	test("shows secondary text and a plain icon when it is not the current page", () => {
		renderItem();

		const link = screen.getByRole("link", { name: "Dashboard" });
		expect(link).toHaveClass("font-medium", "text-ink-2");
		expect(link).not.toHaveClass("bg-soft", "font-semibold");
		expect(link.querySelector("svg")).not.toHaveClass("text-accent");
	});

	test("follows the page when it changes", () => {
		const { rerender } = renderItem({ active: false });

		rerender(
			<NavItem
				label="Dashboard"
				icon={LayoutDashboard}
				href="/dashboard"
				active
			/>,
		);

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});
});

describe("collapsed", () => {
	test("hides the text but keeps the accessible name", () => {
		renderItem({ collapsed: true });

		const link = screen.getByRole("link", { name: "Dashboard" });
		expect(link).toHaveTextContent("");
		expect(link.querySelector("svg")).toBeInTheDocument();
	});

	test("is a 40px square with the icon centred", () => {
		renderItem({ collapsed: true });

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
			"w-10",
			"justify-center",
		);
		expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass(
			"px-3",
		);
	});

	test("shows its label as a tooltip on the right when focused with the keyboard", async () => {
		const user = userEvent.setup();
		renderItem({ collapsed: true });

		await user.tab();

		const tip = await screen.findByRole("tooltip");
		expect(tip).toHaveTextContent("Dashboard");
		expect(tip).toHaveAttribute("data-placement", "right");
	});

	test("shows no tooltip when it already shows its label", async () => {
		const user = userEvent.setup();
		renderItem();

		await user.tab();

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("is marked as the current page and still shows its fill when active", () => {
		renderItem({ collapsed: true, active: true });

		const link = screen.getByRole("link", { name: "Dashboard" });
		expect(link).toHaveAttribute("aria-current", "page");
		expect(link).toHaveClass("bg-soft");
	});

	test("expands again to show the label", () => {
		const { rerender } = renderItem({ collapsed: true });

		rerender(
			<NavItem
				label="Dashboard"
				icon={LayoutDashboard}
				href="/dashboard"
			/>,
		);

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveTextContent(
			"Dashboard",
		);
	});

	test("takes the caller's classes", () => {
		renderItem({ collapsed: true, className: "mt-3.5" });

		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
			"mt-3.5",
		);
	});
});

describe("a list of items", () => {
	test("only the current one is marked, and Tab moves through them in order", async () => {
		const user = userEvent.setup();
		render(
			<nav aria-label="Main">
				<NavItem
					label="Dashboard"
					icon={LayoutDashboard}
					href="/dashboard"
					active
				/>
				<NavItem
					label="Transactions"
					icon={LayoutDashboard}
					href="/transactions"
				/>
			</nav>,
		);

		expect(
			screen
				.getAllByRole("link")
				.filter((link) => link.hasAttribute("aria-current")),
		).toHaveLength(1);
		await user.tab();
		expect(screen.getByRole("link", { name: "Dashboard" })).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("link", { name: "Transactions" })).toHaveFocus();
	});
});
