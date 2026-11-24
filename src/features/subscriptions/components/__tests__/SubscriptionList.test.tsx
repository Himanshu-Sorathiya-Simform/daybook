import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { SubscriptionList as ListData } from "../../lib/types";
import { subscriptionList } from "../../lib/__tests__/fixtures";
import { SubscriptionList, type SubscriptionListProps } from "../SubscriptionList";
import { endedOn, FORMATS, made } from "./rows";

function setup(list: ListData, props: Partial<SubscriptionListProps> = {}) {
	const handlers = {
		onSelect: vi.fn(),
		onEndedOpenChange: vi.fn(),
		onEndedAllChange: vi.fn(),
		onAction: vi.fn(),
	};
	const view = render(
		<SubscriptionList
			list={list}
			formats={FORMATS}
			selected={null}
			endedOpen={false}
			endedAll={false}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, ...view, user: userEvent.setup() };
}

/** A list of `items` with no upcoming charges, as the grouping needs only their dates. */
const listOf = (...items: ListData["items"]): ListData => ({
	...subscriptionList(),
	items,
	upcoming: [],
});

/** The Subscriptions' rows. A group's header is a row of the grid too, without a key. */
const itemRows = () =>
	screen.getAllByRole("row").filter((row) => row.hasAttribute("data-key"));

const eight = Array.from({ length: 8 }, (_, i) =>
	endedOn(`Old plan ${i + 1}`, `2026-0${i + 1 > 9 ? 9 : i + 1}-15`),
);

describe("the groups, golden at 2 November (BR-F05-37)", () => {
	test("Within 7 days, Within 30 days and Later, with the figure of the next 30 days", () => {
		setup(subscriptionList());
		expect(screen.getByText("Within 7 days · 1")).toBeVisible();
		expect(
			screen.getByText("₹649.00", { selector: "span.figures" }),
		).toBeVisible();
		expect(screen.getByText("Within 30 days · 2")).toBeVisible();
		expect(screen.getByText("₹19,500.00")).toBeVisible();
		expect(screen.getByText("Later · 1")).toBeVisible();
	});

	test("lists the rows in group order, by next due date", () => {
		setup(subscriptionList());
		expect(itemRows().map((row) => row.getAttribute("data-key"))).toEqual(
			subscriptionList().items.map((item) => item.id),
		);
	});

	test("Later has no figure", () => {
		setup(subscriptionList());
		expect(screen.getByText("Later · 1").parentElement).not.toHaveTextContent(
			"₹",
		);
	});

	test("is one grid list named Subscriptions", () => {
		setup(subscriptionList());
		expect(screen.getByRole("grid", { name: "Subscriptions" })).toBeVisible();
	});

	test("a group with no row is left out", () => {
		setup(listOf(made("Only", { nextDueOn: "2026-11-04" })));
		expect(screen.getByText("Within 7 days · 1")).toBeVisible();
		expect(screen.queryByText(/Within 30 days|Later|Ended|No more/)).toBeNull();
	});

	test("No more charges has no figure and sits after Later", () => {
		setup(
			listOf(
				made("Club", { nextDueOn: null }),
				made("Soon", { nextDueOn: "2026-11-04" }),
				made("Far", { nextDueOn: "2027-06-01" }),
			),
		);
		const headers = [
			"Within 7 days · 1",
			"Later · 1",
			"No more charges · 1",
		].map((text) => screen.getByText(text));
		expect(headers[0]!.compareDocumentPosition(headers[1]!)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(headers[1]!.compareDocumentPosition(headers[2]!)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	test("shows no 'No running Subscriptions' line while one runs", () => {
		setup(subscriptionList());
		expect(screen.queryByText(/No running Subscriptions/)).toBeNull();
	});
});

describe("the Ended group (BR-F05-37)", () => {
	test("is collapsed until pressed, with its count, and no ended row is shown", () => {
		setup(listOf(made("Running"), ...eight));
		const trigger = screen.getByRole("button", { name: "Ended · 8" });
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText("Old plan 1")).toBeNull();
		expect(itemRows()).toHaveLength(1);
	});

	test("pressing it asks to open", async () => {
		const { user, onEndedOpenChange } = setup(listOf(made("Running"), ...eight));
		await user.click(screen.getByRole("button", { name: "Ended · 8" }));
		expect(onEndedOpenChange).toHaveBeenCalledExactlyOnceWith(true);
	});

	test("open, it shows Newest first and the first 5 rows with Show all 8", () => {
		setup(listOf(made("Running"), ...eight), { endedOpen: true });
		expect(screen.getByText("Newest first")).toBeVisible();
		expect(itemRows()).toHaveLength(6);
		expect(screen.getByRole("button", { name: "Show all 8" })).toBeVisible();
	});

	test("the rows are newest end first", () => {
		setup(listOf(...eight), { endedOpen: true, endedAll: true });
		expect(itemRows().map((row) => row.getAttribute("data-key"))).toEqual(
			[...eight].reverse().map((item) => item.id),
		);
	});

	test("Show all 8 asks for all, and then reads Show fewer", async () => {
		const { user, onEndedAllChange, rerender } = setup(listOf(...eight), {
			endedOpen: true,
		});
		await user.click(screen.getByRole("button", { name: "Show all 8" }));
		expect(onEndedAllChange).toHaveBeenCalledExactlyOnceWith(true);
		rerender(
			<SubscriptionList
				list={listOf(...eight)}
				formats={FORMATS}
				selected={null}
				endedOpen
				endedAll
				onSelect={vi.fn()}
				onEndedOpenChange={vi.fn()}
				onEndedAllChange={onEndedAllChange}
				onAction={vi.fn()}
			/>,
		);
		expect(itemRows()).toHaveLength(8);
		await user.click(screen.getByRole("button", { name: "Show fewer" }));
		expect(onEndedAllChange).toHaveBeenLastCalledWith(false);
	});

	test.each([1, 3, 5])("with %i ended rows there is no toggle", (count) => {
		setup(listOf(...eight.slice(0, count)), { endedOpen: true });
		expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
		expect(itemRows()).toHaveLength(count);
	});

	test("with 6 ended rows the toggle reads Show all 6", () => {
		setup(listOf(...eight.slice(0, 6)), { endedOpen: true });
		expect(screen.getByRole("button", { name: "Show all 6" })).toBeVisible();
		expect(itemRows()).toHaveLength(5);
	});

	test("is left out when nothing has ended", () => {
		setup(subscriptionList());
		expect(screen.queryByRole("button", { name: /Ended/ })).toBeNull();
	});
});

describe("with no running Subscription (BR-F05-37)", () => {
	test("says so above the Ended group", () => {
		setup(listOf(...eight.slice(0, 2)));
		expect(
			screen.getByText(
				"No running Subscriptions. Resume one below, or add a new one.",
			),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "Ended · 2" })).toBeVisible();
	});

	test("has no running grid, only the Ended group when opened", () => {
		setup(listOf(...eight.slice(0, 2)), { endedOpen: true });
		expect(screen.getAllByRole("grid")).toHaveLength(1);
		expect(itemRows()).toHaveLength(2);
	});
});

describe("selecting a row (BR-F05-40, BR-F05-45)", () => {
	const list = subscriptionList();
	const [first, second] = list.items;

	test("pressing a row selects its Subscription", async () => {
		const { user, onSelect } = setup(list);
		await user.click(screen.getByRole("row", { name: /^Cult Gym/ }));
		expect(onSelect).toHaveBeenCalledExactlyOnceWith(second!.id);
	});

	test("the selected row is marked and the others are not", () => {
		setup(list, { selected: first!.id });
		const rows = itemRows();
		expect(rows[0]).toHaveAttribute("aria-selected", "true");
		expect(rows[1]).toHaveAttribute("aria-selected", "false");
	});

	test("pressing the selected row again clears the selection", async () => {
		const { user, onSelect } = setup(list, { selected: first!.id });
		await user.click(itemRows()[0]!);
		expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
	});

	test("Enter and Space on a focused row select it", async () => {
		const { user, onSelect } = setup(list);
		await user.tab();
		await user.keyboard("{Enter}");
		expect(onSelect).toHaveBeenLastCalledWith(first!.id);
		await user.keyboard(" ");
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	test("an id that is not in the list marks no row", () => {
		setup(list, { selected: "0192f0c4-0000-7000-8000-000000000000" });
		for (const row of itemRows()) {
			expect(row).toHaveAttribute("aria-selected", "false");
		}
	});

	test("a selected ended row is marked inside the Ended group", () => {
		const ended = endedOn("Old plan", "2026-09-30");
		setup(listOf(made("Running"), ended), {
			selected: ended.id,
			endedOpen: true,
		});
		expect(screen.getByRole("row", { name: /^Old plan/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	test("pressing an ended row selects it", async () => {
		const ended = endedOn("Old plan", "2026-09-30");
		const { user, onSelect } = setup(listOf(ended), { endedOpen: true });
		await user.click(screen.getByRole("row", { name: /^Old plan/ }));
		expect(onSelect).toHaveBeenCalledExactlyOnceWith(ended.id);
	});

	test("typing a letter does not jump to a row, as letters are the page's shortcuts", async () => {
		const { user, onSelect } = setup(list);
		await user.tab();
		await user.keyboard("s");
		expect(itemRows()[0]).toHaveFocus();
		expect(onSelect).not.toHaveBeenCalled();
	});
});

describe("the row menu in the list (BR-F05-22, BR-F05-23)", () => {
	test("pressing the menu button does not select the row", async () => {
		const { user, onSelect } = setup(subscriptionList());
		await user.click(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		);
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("View charges runs with the row's id", async () => {
		const { user, onAction } = setup(subscriptionList());
		await user.click(
			screen.getByRole("button", { name: "Actions for Cult Gym" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "View charges" }));
		expect(onAction).toHaveBeenCalledExactlyOnceWith(
			"viewCharges",
			subscriptionList().items[1]!.id,
		);
	});

	test("an ended row has its own menu", () => {
		setup(listOf(endedOn("Old plan", "2026-09-30")), { endedOpen: true });
		expect(
			screen.getByRole("button", { name: "Actions for Old plan" }),
		).toBeVisible();
	});
});

describe("the layouts are CSS (D-625)", () => {
	test("every row has one date column and one menu, each for wide rows only", () => {
		setup(subscriptionList());
		for (const row of itemRows()) {
			expect(
				within(row).getAllByRole("button", { name: /^Actions for/ }),
			).toHaveLength(1);
		}
		for (const button of screen.getAllByRole("button", {
			name: /^Actions for/,
		})) {
			expect(button.closest(".max-md\\:hidden")).not.toBeNull();
		}
		expect(itemRows()).toHaveLength(4);
	});
});

describe("the 30-day caption in the list (BR-F05-22)", () => {
	test("a weekly Subscription's caption comes from the upcoming list", () => {
		const tiffin = made("Tiffin", { nextDueOn: "2026-11-04" });
		const list = {
			...listOf(tiffin),
			upcoming: ["2026-11-04", "2026-11-11", "2026-11-18"].map((dueOn) => ({
				subscriptionId: tiffin.id,
				dueOn,
				amountMinor: 12000,
			})),
		};
		setup(list);
		expect(
			screen.getByText("3 charges in the next 30 days, ₹360.00"),
		).toBeVisible();
	});
});

describe("the category chip (BR-F05-50, D-622)", () => {
	test("shows nothing while the list is not filtered", () => {
		setup(subscriptionList());
		expect(screen.queryByText("Showing")).toBeNull();
		expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
	});

	test("shows Showing, the category's name as a chip, and Show all", () => {
		setup(subscriptionList(), { category: "entertainment" });
		expect(screen.getByText("Showing")).toBeVisible();
		expect(screen.getByRole("grid", { name: "Showing" })).toHaveTextContent(
			"Entertainment",
		);
		expect(screen.getByRole("button", { name: "Show all" })).toBeVisible();
	});

	test("the chip's remove button is named for the category and clears the filter", async () => {
		const onClearCategory = vi.fn();
		const { user } = setup(subscriptionList(), {
			category: "entertainment",
			onClearCategory,
		});
		await user.click(
			screen.getByRole("button", { name: "Remove Entertainment" }),
		);
		expect(onClearCategory).toHaveBeenCalledOnce();
	});

	test("Show all clears it too", async () => {
		const onClearCategory = vi.fn();
		const { user } = setup(subscriptionList(), {
			category: "entertainment",
			onClearCategory,
		});
		await user.click(screen.getByRole("button", { name: "Show all" }));
		expect(onClearCategory).toHaveBeenCalledOnce();
	});

	test("a multi-word category reads as its label", () => {
		setup(listOf(made("Soap", { category: "personal_care" })), {
			category: "personal_care",
		});
		expect(screen.getByRole("grid", { name: "Showing" })).toHaveTextContent(
			"Personal care",
		);
	});

	test("sits above the groups", () => {
		setup(subscriptionList(), { category: "entertainment" });
		const chip = screen.getByText("Showing");
		const grid = screen.getByRole("grid", { name: "Subscriptions" });
		expect(chip.compareDocumentPosition(grid)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});
});
