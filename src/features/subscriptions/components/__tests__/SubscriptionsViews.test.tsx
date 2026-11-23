import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { DEFAULT_SORTING } from "../../lib/table";
import { subscriptionList } from "../../lib/__tests__/fixtures";
import {
	SubscriptionsViews,
	type SubscriptionsViewsProps,
} from "../SubscriptionsViews";
import { FORMATS } from "./rows";

// Each view is tested on its own; here each is a stub that says what it was given.
vi.mock("../SubscriptionList", () => ({
	SubscriptionList: (props: {
		list: { items: unknown[] };
		category: string | null;
	}) => (
		<p>
			list of {props.list.items.length}, category {String(props.category)}
		</p>
	),
}));
vi.mock("../SubscriptionTable", () => ({
	SubscriptionTable: (props: { list: { items: unknown[] } }) => (
		<p>table of {props.list.items.length}</p>
	),
}));
vi.mock("../SubscriptionCalendar", () => ({
	SubscriptionCalendar: (props: { items: unknown[]; isWide: boolean }) => (
		<p>
			calendar of {props.items.length}, wide {String(props.isWide)}
		</p>
	),
}));

const GOLDEN = subscriptionList();

function setup(props: Partial<SubscriptionsViewsProps> = {}) {
	// The filter left one of the four.
	const shown = { ...GOLDEN, items: GOLDEN.items.slice(0, 1) };
	return render(
		<SubscriptionsViews
			view="list"
			shown={shown}
			items={GOLDEN.items}
			formats={{ ...FORMATS, weekStart: "monday" }}
			selected={null}
			onSelect={vi.fn()}
			arrows="select"
			category={null}
			onClearCategory={vi.fn()}
			endedOpen={false}
			onEndedOpenChange={vi.fn()}
			endedAll={false}
			onEndedAllChange={vi.fn()}
			onAction={vi.fn()}
			sorting={DEFAULT_SORTING}
			onSortingChange={vi.fn()}
			isWide
			markedDue={null}
			onSelectItem={vi.fn()}
			{...props}
		/>,
	);
}

describe("the view of the Subscriptions page (BR-F05-21)", () => {
	test("the list shows the Subscriptions the filter left", () => {
		setup({ view: "list", category: "entertainment" });
		expect(screen.getByText("list of 1, category entertainment")).toBeVisible();
		expect(screen.queryByText(/^table of/)).toBeNull();
		expect(screen.queryByText(/^calendar of/)).toBeNull();
	});

	test("the table shows the Subscriptions the filter left", () => {
		setup({ view: "table" });
		expect(screen.getByText("table of 1")).toBeVisible();
		expect(screen.queryByText(/^list of/)).toBeNull();
		expect(screen.queryByText(/^calendar of/)).toBeNull();
	});

	test.each([true, false])(
		"the calendar shows every Subscription, whatever the filter, at wide=%s",
		(isWide) => {
			setup({ view: "calendar", isWide });
			expect(
				screen.getByText(
					`calendar of ${GOLDEN.items.length}, wide ${isWide}`,
				),
			).toBeVisible();
			expect(screen.queryByText(/^list of/)).toBeNull();
			expect(screen.queryByText(/^table of/)).toBeNull();
		},
	);
});
