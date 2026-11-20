import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import {
	SubscriptionsHeader,
	type SubscriptionsHeaderProps,
} from "../SubscriptionsHeader";

function renderHeader(props: Partial<SubscriptionsHeaderProps> = {}) {
	const onViewChange = vi.fn();
	const view = renderInApp(
		<SubscriptionsHeader
			asOf={null}
			view="list"
			hasSwitch
			onViewChange={onViewChange}
			{...props}
		/>,
	);
	return { ...view, onViewChange, user: userEvent.setup() };
}

const choices = () =>
	screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"));

describe("SubscriptionsHeader (BR-F05-21)", () => {
	test("the title and the switch, in that order", () => {
		renderHeader();
		const title = screen.getByRole("heading", {
			level: 1,
			name: "Subscriptions",
		});
		const group = screen.getByRole("radiogroup", {
			name: "Show Subscriptions as",
		});
		expect(
			title.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("the switch always draws List, Calendar and Table, in that order", () => {
		renderHeader();
		expect(choices()).toEqual(["list", "calendar", "table"]);
	});

	// D-629
	test("Table is hidden below 768 px by CSS, so the server draws the final switch", () => {
		renderHeader();
		const hiddenBelow768 = (name: string) =>
			screen.getByRole("radio", { name }).closest(".max-md\\:hidden") !== null;
		expect(hiddenBelow768("Table")).toBe(true);
		expect(hiddenBelow768("List")).toBe(false);
		expect(hiddenBelow768("Calendar")).toBe(false);
	});

	test.each(["list", "calendar", "table"] as const)(
		"%s is the checked one when it shows",
		(view) => {
			renderHeader({ view });
			expect(
				screen.getByRole("radio", { checked: true }),
			).toHaveAccessibleName(
				{ list: "List", calendar: "Calendar", table: "Table" }[view],
			);
		},
	);

	test("choosing another view reports it", async () => {
		const { user, onViewChange } = renderHeader();
		await user.click(screen.getByRole("radio", { name: "Calendar" }));
		expect(onViewChange).toHaveBeenCalledWith("calendar");
		await user.click(screen.getByRole("radio", { name: "Table" }));
		expect(onViewChange).toHaveBeenLastCalledWith("table");
	});

	test("the arrow keys move from one view to the next", async () => {
		const { user, onViewChange } = renderHeader({ view: "calendar" });
		await user.tab();
		await user.keyboard("{ArrowRight}");
		expect(onViewChange).toHaveBeenLastCalledWith("table");
	});

	test("choosing the checked view again changes nothing", async () => {
		const { user, onViewChange } = renderHeader();
		await user.click(screen.getByRole("radio", { name: "List" }));
		expect(onViewChange).not.toHaveBeenCalled();
	});

	test("leaves the switch out when there is nothing to show", () => {
		renderHeader({ hasSwitch: false });
		expect(screen.queryByRole("radiogroup")).toBeNull();
		expect(
			screen.getByRole("heading", { level: 1, name: "Subscriptions" }),
		).toBeVisible();
	});

	test('shows "as of" beside the title when given', () => {
		renderHeader({ asOf: "as of 2:05 pm" });
		expect(screen.getByText("as of 2:05 pm")).toBeVisible();
	});

	test('has no "as of" online', () => {
		renderHeader();
		expect(screen.queryByText(/^as of /)).toBeNull();
	});

	test("has no Add button yet, so no dead button ships", () => {
		renderHeader();
		expect(
			screen.queryByRole("button", { name: /Add a Subscription/ }),
		).toBeNull();
	});
});
