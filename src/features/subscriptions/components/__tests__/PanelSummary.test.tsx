import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
	emptyList,
	subscriptionItem,
	subscriptionList,
} from "../../lib/__tests__/fixtures";
import { PanelSummary } from "../PanelSummary";
import { FORMATS } from "./rows";

const golden = () => {
	const list = subscriptionList();
	return {
		...list,
		items: [list.items[0]!, list.items[1]!, list.items[2]!, list.items[3]!],
	};
};

describe("PanelSummary (BR-F05-40, AC-F05-37)", () => {
	test("is titled Your Subscriptions, with Monthly cost by category", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
			/>,
		);
		expect(
			screen.getByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
		expect(screen.getByText("Monthly cost by category")).toBeVisible();
	});

	test("golden: Housing, Health and Entertainment, largest first, with amounts and shares", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
			/>,
		);
		const rows = within(
			screen.getByRole("list", { name: "Monthly cost by category" }),
		).getAllByRole("listitem");
		expect(rows.map((row) => row.textContent)).toEqual([
			"Housing₹18,000.0088.8%",
			"Health₹1,500.007.4%",
			"Entertainment₹773.923.8%",
		]);
	});

	test("each bar is as wide as its share and hidden from screen readers", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
			/>,
		);
		const rows = screen.getAllByRole("listitem");
		const bars = rows.map(
			(row) => row.querySelector("[aria-hidden=true] > div") as HTMLElement,
		);
		expect(bars.map((bar) => bar.style.width)).toEqual([
			"88.8%",
			"7.4%",
			"3.8%",
		]);
		for (const bar of bars)
			expect(bar.parentElement).toHaveAttribute("aria-hidden", "true");
	});

	test("each bar is drawn in its category's colour", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
			/>,
		);
		const bar = screen
			.getAllByRole("listitem")[0]!
			.querySelector("[aria-hidden=true] > div") as HTMLElement;
		expect(bar.style.background).toBe("var(--cat-housing)");
	});

	test("has the box How charges work and the hint", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
			/>,
		);
		const box = screen.getByRole("region", { name: "How charges work" });
		expect(box).toHaveTextContent(
			"Daybook adds each charge to Transactions as an expense on its due date. Future charges aren't added until they're due.",
		);
		expect(box).toHaveTextContent(
			"Deleting a charge in Transactions skips it. Daybook won't add it again.",
		);
		expect(box).toHaveTextContent(
			"Cancelling or deleting a Subscription keeps the charges that already happened.",
		);
		expect(
			screen.getByText(
				"Select a Subscription to see its charges. Up and down arrows move.",
			),
		).toBeVisible();
	});

	test("an ended Subscription is not in the costs", () => {
		const list = golden();
		render(
			<PanelSummary
				list={{
					...list,
					items: [
						...list.items,
						subscriptionItem("netflix", {
							id: "x",
							status: "ended",
							nextDueOn: null,
							category: "travel",
							yearlyMinor: 999900,
						}),
					],
				}}
				formats={FORMATS}
			/>,
		);
		expect(screen.queryByText("Travel")).toBeNull();
	});

	test("with no Subscription it shows no category list, only the box and the hint", () => {
		render(
			<PanelSummary
				list={emptyList()}
				formats={FORMATS}
			/>,
		);
		expect(screen.queryByRole("list")).toBeNull();
		expect(
			screen.getByRole("region", { name: "How charges work" }),
		).toBeVisible();
	});

	test("the figures follow the profile's format", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={{ ...FORMATS, currency: "USD", numberLocale: "en-US" }}
			/>,
		);
		expect(screen.getByText("$18,000.00")).toBeVisible();
	});
});

describe("the category buttons (BR-F05-40, BR-F05-50, D-622)", () => {
	const buttons = () =>
		within(
			screen.getByRole("list", { name: "Monthly cost by category" }),
		).getAllByRole("button");

	test("each category is a button named by it, largest first", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
			/>,
		);
		expect(buttons().map((b) => b.textContent)).toEqual([
			"Housing",
			"Health",
			"Entertainment",
		]);
	});

	test("pressing one asks to filter to it", async () => {
		const onCategory = vi.fn();
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
				onCategory={onCategory}
			/>,
		);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Health" }));
		expect(onCategory).toHaveBeenCalledExactlyOnceWith("health");
	});

	test("Enter and Space press it from the keyboard", async () => {
		const onCategory = vi.fn();
		const user = userEvent.setup();
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
				onCategory={onCategory}
			/>,
		);
		screen.getByRole("button", { name: "Housing" }).focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		expect(onCategory.mock.calls).toEqual([["housing"], ["housing"]]);
	});

	test("the category the list is filtered to reads as pressed, the others not", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
				activeCategory="health"
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Health", pressed: true }),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Housing", pressed: false }),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Entertainment", pressed: false }),
		).toBeVisible();
	});

	test("with no filter none is pressed", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
			/>,
		);
		for (const b of buttons())
			expect(b).toHaveAttribute("aria-pressed", "false");
	});

	test("every row shows a pointer and a hover, and the pressed one is filled", () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
				activeCategory="health"
			/>,
		);
		const rows = screen.getAllByRole("listitem");
		for (const row of rows) expect(row).toHaveClass("cursor-pointer");
		const health = screen.getByRole("button", { name: "Health" }).closest("li")!;
		expect(health).toHaveClass("bg-accent-soft");
		for (const row of rows.filter((r) => r !== health))
			expect(row).toHaveClass("hover:bg-soft");
	});

	test("a press without a handler does nothing", async () => {
		render(
			<PanelSummary
				list={golden()}
				formats={FORMATS}
			/>,
		);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Housing" }));
		expect(screen.getByText("Housing")).toBeVisible();
	});
});
