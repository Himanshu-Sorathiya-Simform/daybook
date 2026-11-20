import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GridList as AriaGridList } from "react-aria-components";
import { describe, expect, test, vi } from "vitest";

import { subscriptionItem } from "../../lib/__tests__/fixtures";
import { SubscriptionRow } from "../SubscriptionRow";
import { endedOn, FORMATS, made, rowOf } from "./rows";

function setup(
	row: ReturnType<typeof rowOf>,
	{ isWide = true }: { isWide?: boolean } = {},
) {
	const onAction = vi.fn();
	render(
		<AriaGridList aria-label="Subscriptions">
			<SubscriptionRow
				row={row}
				formats={FORMATS}
				isWide={isWide}
				onAction={onAction}
			/>
		</AriaGridList>,
	);
	return { onAction, user: userEvent.setup() };
}

const netflix = subscriptionItem("netflix");
const prime = subscriptionItem("amazonPrime");

describe("a row from 768 px (BR-F05-22, AC-F05-34)", () => {
	test("reads the next due date over how far off it is, then the name and category", () => {
		setup(rowOf(netflix));
		const row = screen.getByRole("row");
		expect(within(row).getByText("Thu, 5 Nov")).toBeVisible();
		expect(within(row).getByText("in 3 days")).toBeVisible();
		expect(within(row).getByText("Netflix")).toBeVisible();
		expect(within(row).getByText("Entertainment")).toBeVisible();
	});

	test("shows the amount with its cadence and no monthly line for a monthly one", () => {
		setup(rowOf(netflix));
		const row = screen.getByRole("row");
		expect(within(row).getByText("₹649.00")).toBeVisible();
		expect(within(row).getByText("a month")).toBeVisible();
		expect(within(row).queryByText(/≈/)).toBeNull();
	});

	test("a yearly one adds its monthly equivalent, and a date outside the year has no weekday", () => {
		setup(rowOf(prime));
		const row = screen.getByRole("row");
		expect(within(row).getByText("₹1,499.00")).toBeVisible();
		expect(within(row).getByText("a year")).toBeVisible();
		expect(within(row).getByText("≈ ₹124.92 a month")).toBeVisible();
		expect(within(row).getByText("12 Oct 2027")).toBeVisible();
		expect(within(row).getByText("in 11 months")).toBeVisible();
	});

	test("a due date of today reads today", () => {
		setup(rowOf(made("Today", { nextDueOn: "2026-11-02" })));
		expect(screen.getByText("today")).toBeVisible();
	});

	test("has its actions menu, named for the Subscription", () => {
		setup(rowOf(netflix));
		expect(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		).toBeVisible();
	});

	test("the menu offers View charges and runs it with the row's id", async () => {
		const { user, onAction } = setup(rowOf(netflix));
		await user.click(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "View charges" }));
		expect(onAction).toHaveBeenCalledExactlyOnceWith("viewCharges", netflix.id);
	});

	test("the menu offers only what is built so far", async () => {
		const { user } = setup(rowOf(netflix));
		await user.click(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		);
		expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
			"View charges",
		]);
	});

	test("the row is named by its whole reading, name first", () => {
		setup(rowOf(netflix));
		expect(screen.getByRole("row")).toHaveAccessibleName(
			"Netflix, Entertainment, ₹649.00 a month, Thu, 5 Nov in 3 days",
		);
	});
});

describe("badges (BR-F05-22)", () => {
	test("an upcoming one reads Starts and its start date", () => {
		setup(
			rowOf(made("Hotstar", { status: "upcoming", startDate: "2026-12-05" })),
		);
		expect(screen.getByText("Starts 5 Dec")).toBeVisible();
	});

	test("an ending one reads Ends with the year", () => {
		setup(rowOf(made("Spotify", { status: "ending", endDate: "2026-12-31" })));
		expect(screen.getByText("Ends 31 Dec 2026")).toBeVisible();
	});

	test("a paused one reads Paused until its next due date, with the date column saying resumes", () => {
		setup(rowOf(made("Kindle", { status: "paused", nextDueOn: "2027-01-05" })));
		expect(screen.getByText("Paused until 5 Jan 2027")).toBeVisible();
		expect(screen.getByText("resumes")).toBeVisible();
	});

	test("a paused badge has a pause icon, and no other badge has one", () => {
		setup(rowOf(made("Kindle", { status: "paused", nextDueOn: "2027-01-05" })));
		expect(
			screen.getByText("Paused until 5 Jan 2027").querySelector("svg"),
		).not.toBeNull();
		cleanup();
		setup(rowOf(made("Spotify", { status: "ending", endDate: "2026-12-31" })));
		expect(screen.getByText("Ends 31 Dec 2026").querySelector("svg")).toBeNull();
	});

	test("a paused one with no next due reads Paused", () => {
		setup(rowOf(made("Kindle", { status: "paused", nextDueOn: null })));
		expect(screen.getByText("Paused")).toBeVisible();
	});

	test("an active one has none", () => {
		setup(rowOf(netflix));
		expect(screen.queryByText(/Starts|Ends|Paused/)).toBeNull();
	});
});

describe("the 30-day caption (BR-F05-22, AC-F05-34)", () => {
	test("is shown for more than one charge", () => {
		setup(rowOf(made("Tiffin"), 5, 60000));
		expect(
			screen.getByText("5 charges in the next 30 days, ₹600.00"),
		).toBeVisible();
	});

	test.each([0, 1])("is left out for %i charge(s)", (count) => {
		setup(rowOf(netflix, count, count * 64900));
		expect(screen.queryByText(/charges in the next 30 days/)).toBeNull();
	});
});

describe("an ended row (BR-F05-22)", () => {
	const ended = endedOn("Old plan", "2026-09-30");

	test("reads Ended over its end date and has no next due", () => {
		setup(rowOf(ended));
		expect(screen.getByText("Ended")).toBeVisible();
		expect(screen.getByText("30 Sept 2026")).toBeVisible();
	});

	test("is dimmed", () => {
		setup(rowOf(ended));
		expect(screen.getByText("Ended")).toHaveClass("text-ink-2");
		expect(screen.getByText("₹649.00")).toHaveClass("text-ink-2");
	});

	test("has no Resume button until its dialog exists, and the menu offers View charges", async () => {
		const { user } = setup(rowOf(ended));
		expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
		await user.click(
			screen.getByRole("button", { name: "Actions for Old plan" }),
		);
		expect(screen.getAllByRole("menuitem")).toHaveLength(1);
	});
});

describe("a Subscription with no next due date (BR-F05-22)", () => {
	test("reads No more charges over when it ends", () => {
		setup(
			rowOf(
				made("Club", {
					nextDueOn: null,
					status: "ending",
					endDate: "2026-12-31",
				}),
			),
		);
		expect(screen.getByText("No more charges")).toBeVisible();
		expect(screen.getByText("Ends 31 Dec")).toBeVisible();
	});
});

describe("a row below 768 px (BR-F05-22)", () => {
	test("has no date column and no menu", () => {
		setup(rowOf(netflix), { isWide: false });
		expect(screen.queryByText("in 3 days")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});

	test("puts the next due date under the amount, not the monthly equivalent", () => {
		setup(rowOf(prime), { isWide: false });
		expect(screen.getByText("12 Oct 2027")).toBeVisible();
		expect(screen.queryByText(/≈/)).toBeNull();
		expect(screen.getByText("₹1,499.00")).toBeVisible();
	});

	test("an ended one reads Ended and its end date under the amount", () => {
		setup(rowOf(endedOn("Old plan", "2026-09-30")), { isWide: false });
		expect(screen.getByText("Ended 30 Sept")).toBeVisible();
	});

	test("a row with no next due has nothing under the amount", () => {
		setup(rowOf(made("Club", { nextDueOn: null })), { isWide: false });
		expect(screen.getByText("₹649.00")).toBeVisible();
		expect(screen.queryByText(/Nov|Dec/)).toBeNull();
	});

	test("the category sits under the name", () => {
		setup(rowOf(netflix), { isWide: false });
		expect(screen.getByText("Entertainment")).toBeVisible();
	});

	test("is named by its reading with the date under the amount", () => {
		setup(rowOf(netflix), { isWide: false });
		expect(screen.getByRole("row")).toHaveAccessibleName(
			"Netflix, Entertainment, ₹649.00 a month, Thu, 5 Nov",
		);
	});
});
