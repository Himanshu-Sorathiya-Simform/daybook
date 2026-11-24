import { onlineManager } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { ok, route, testClient } from "../../hooks/__tests__/helpers";
import { DEFAULT_SORTING, TABLE_CAPTION } from "../../lib/table";
import {
	listPage,
	monthsAnswer,
	subscriptionList,
} from "../../lib/__tests__/fixtures";
import {
	SubscriptionsViews,
	type SubscriptionsViewsProps,
} from "../SubscriptionsViews";
import { CAL, rowWidth } from "./calendar-data";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	vi.unstubAllGlobals();
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const GOLDEN = subscriptionList();

function setup(props: Partial<SubscriptionsViewsProps> = {}) {
	// The calendar reads a month's charges and figures; the list and the table read nothing.
	route(network, "get", "/api/transactions", () => ok(listPage([])));
	route(network, "get", "/api/subscriptions/months", (request) => {
		const query = new URL(request.path, "http://x").searchParams;
		return ok(monthsAnswer(query.get("from")!, query.get("to")!));
	});
	rowWidth(800);
	// The filter left one of the four.
	const shown = { ...GOLDEN, items: GOLDEN.items.slice(0, 1) };
	return render(
		<AppProviders
			navigate={vi.fn()}
			queryClient={testClient()}
		>
			<SubscriptionsViews
				view="list"
				shown={shown}
				items={GOLDEN.items}
				formats={CAL}
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
			/>
		</AppProviders>,
	);
}

const list = () => screen.queryByRole("grid", { name: "Subscriptions" });
const table = () => screen.queryByRole("grid", { name: TABLE_CAPTION });
const calendar = () => screen.queryByRole("table", { name: "November 2026" });

describe("the view of the Subscriptions page (BR-F05-21)", () => {
	test("the list shows the Subscriptions the filter left", () => {
		setup({ view: "list" });
		expect(list()).toBeVisible();
		expect(screen.getByText("Netflix")).toBeVisible();
		expect(screen.queryByText("Cult Gym")).toBeNull();
		expect(table()).toBeNull();
		expect(calendar()).toBeNull();
	});

	test("the list shows the category the filter is on, with a way to clear it", async () => {
		const onClearCategory = vi.fn();
		setup({ view: "list", category: "entertainment", onClearCategory });
		await userEvent.click(screen.getByRole("button", { name: "Show all" }));
		expect(onClearCategory).toHaveBeenCalledOnce();
	});

	test("the table shows the Subscriptions the filter left", () => {
		setup({ view: "table" });
		expect(table()).toBeVisible();
		expect(screen.getByText("Netflix")).toBeVisible();
		expect(screen.queryByText("Cult Gym")).toBeNull();
		expect(list()).toBeNull();
		expect(calendar()).toBeNull();
	});

	test("the calendar shows every Subscription, whatever the filter", async () => {
		setup({ view: "calendar" });
		expect(
			await screen.findByRole("table", { name: "November 2026" }),
		).toBeVisible();
		expect(list()).toBeNull();
		expect(table()).toBeNull();
	});

	test("below 768 px the calendar is a list of weeks", async () => {
		setup({ view: "calendar", isWide: false });
		expect(
			await screen.findByRole("heading", { level: 3, name: "1 Nov" }),
		).toBeVisible();
		expect(calendar()).toBeNull();
	});
});
