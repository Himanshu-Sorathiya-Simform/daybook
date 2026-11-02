import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { describe, expect, test, vi } from "vitest";

import { BottomBar, type BottomBarProps } from "../BottomBar";

function renderBar(props: Partial<BottomBarProps> = {}) {
	const navigate = vi.fn();
	render(
		<AriaRouterProvider navigate={navigate}>
			<BottomBar
				pathname="/transactions"
				{...props}
			/>
		</AriaRouterProvider>,
	);
	return { nav: screen.getByRole("navigation", { name: "Main" }), navigate };
}

const more = (nav: HTMLElement) => within(nav).getByRole("button", { name: "More" });

describe("BottomBar (root section 4, D-512)", () => {
	test("is the Main navigation, fixed to the foot of the screen", () => {
		const { nav } = renderBar();
		expect(nav).toHaveClass("fixed", "bottom-0", "h-(--bottom-bar-height)");
	});

	// D-504: Add arrives with F03's interface.
	test("holds Dashboard, Transactions, Budgets and More, in that order, without Add", () => {
		const { nav } = renderBar();
		expect(
			[...nav.querySelectorAll("a, button")].map((item) => item.textContent),
		).toEqual(["Dashboard", "Transactions", "Budgets", "More"]);
		expect(within(nav).queryByRole("button", { name: /Add/ })).toBeNull();
	});

	test("the three links open their routes", () => {
		const { nav } = renderBar();
		expect(
			within(nav)
				.getAllByRole("link")
				.map((link) => link.getAttribute("href")),
		).toEqual(["/dashboard", "/transactions", "/budgets"]);
	});

	test("each item shows a decorative icon above its label", () => {
		const { nav } = renderBar();
		for (const item of nav.querySelectorAll("a, button")) {
			expect(item.firstElementChild?.tagName.toLowerCase()).toBe("svg");
			expect(item.firstElementChild).toHaveAttribute("aria-hidden", "true");
		}
	});

	test("every item is at least the touch target high", () => {
		const { nav } = renderBar();
		for (const item of nav.querySelectorAll("a, button"))
			expect(item).toHaveClass("min-h-(--target-min)");
	});

	test("marks the current link as the page, in the accent colour", () => {
		const { nav } = renderBar({ pathname: "/budgets" });
		const budgets = within(nav).getByRole("link", { name: "Budgets" });
		expect(budgets).toHaveAttribute("aria-current", "page");
		expect(budgets).toHaveClass("text-accent");
		expect(
			within(nav).getByRole("link", { name: "Transactions" }),
		).not.toHaveAttribute("aria-current");
		expect(more(nav)).not.toHaveAttribute("aria-current");
		expect(more(nav)).toHaveClass("text-ink-2");
	});

	test.each(["/goals", "/settings/profile", "/learn", "/subscriptions"])(
		"on %s, More is the current item",
		(pathname) => {
			const { nav } = renderBar({ pathname });
			expect(more(nav)).toHaveAttribute("aria-current", "true");
			expect(more(nav)).toHaveClass("text-accent");
			for (const link of within(nav).getAllByRole("link"))
				expect(link).not.toHaveAttribute("aria-current");
		},
	);

	test("a look-alike path marks nothing", () => {
		const { nav } = renderBar({ pathname: "/goalsx" });
		expect(nav.querySelector("[aria-current]")).toBeNull();
	});

	test("a link navigates through the router", async () => {
		const user = userEvent.setup();
		const { nav, navigate } = renderBar();
		await user.click(within(nav).getByRole("link", { name: "Budgets" }));
		expect(navigate).toHaveBeenCalledWith("/budgets", undefined);
	});

	test("More opens the sheet with the rest", async () => {
		const user = userEvent.setup();
		const { nav } = renderBar();
		expect(screen.queryByRole("dialog")).toBeNull();
		await user.click(more(nav));
		const sheet = await screen.findByRole("dialog", { name: "More" });
		expect(within(sheet).getAllByRole("link")).toHaveLength(8);
	});

	test.each(["{Enter}", " "])(
		"More opens from the keyboard with %s",
		async (key) => {
			const user = userEvent.setup();
			const { nav } = renderBar();
			more(nav).focus();
			await user.keyboard(key);
			expect(
				await screen.findByRole("dialog", { name: "More" }),
			).toBeInTheDocument();
		},
	);

	test("focus stays inside the open sheet", async () => {
		const user = userEvent.setup();
		const { nav } = renderBar();
		await user.click(more(nav));
		const sheet = await screen.findByRole("dialog", { name: "More" });
		for (let step = 0; step < 12; step++) {
			await user.tab();
			expect(sheet).toContainElement(document.activeElement as HTMLElement);
		}
	});

	test("Escape closes the sheet and puts focus back on More", async () => {
		const user = userEvent.setup();
		const { nav } = renderBar();
		await user.click(more(nav));
		await screen.findByRole("dialog");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(more(nav)).toHaveFocus());
	});

	test("choosing a destination in the sheet navigates and closes it", async () => {
		const user = userEvent.setup();
		const { nav, navigate } = renderBar();
		await user.click(more(nav));
		await user.click(await screen.findByRole("link", { name: "Insights" }));
		expect(navigate).toHaveBeenCalledWith("/insights", undefined);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	test("the sheet can open again after closing", async () => {
		const user = userEvent.setup();
		const { nav } = renderBar();
		await user.click(more(nav));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(more(nav));
		expect(
			await screen.findByRole("dialog", { name: "More" }),
		).toBeInTheDocument();
	});

	test("takes a class name", () => {
		const { nav } = renderBar({ className: "md:hidden" });
		expect(nav).toHaveClass("md:hidden");
	});
});
