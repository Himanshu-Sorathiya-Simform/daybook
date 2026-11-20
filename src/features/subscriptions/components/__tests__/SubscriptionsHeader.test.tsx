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
			isWide
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

	test("from 768 px the switch offers List, Calendar and Table", () => {
		renderHeader();
		expect(screen.getAllByRole("radio")).toHaveLength(3);
		for (const name of ["List", "Calendar", "Table"])
			expect(screen.getByRole("radio", { name })).toBeInTheDocument();
	});

	test("below 768 px Table is not offered", () => {
		renderHeader({ isWide: false });
		expect(screen.getAllByRole("radio")).toHaveLength(2);
		for (const name of ["List", "Calendar"])
			expect(screen.getByRole("radio", { name })).toBeInTheDocument();
		expect(screen.queryByRole("radio", { name: "Table" })).toBeNull();
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

	test("the arrow keys move between the offered views only", async () => {
		const { user, onViewChange } = renderHeader({
			isWide: false,
			view: "calendar",
		});
		await user.tab();
		await user.keyboard("{ArrowRight}");
		expect(onViewChange).toHaveBeenLastCalledWith("list");
		expect(choices()).toEqual(["list", "calendar"]);
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
