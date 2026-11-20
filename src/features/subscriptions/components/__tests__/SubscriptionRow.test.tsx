import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GridList as AriaGridList } from "react-aria-components";
import { describe, expect, test, vi } from "vitest";

import { subscriptionItem } from "../../lib/__tests__/fixtures";
import { SubscriptionRow } from "../SubscriptionRow";
import { endedOn, FORMATS, made, rowOf } from "./rows";

function setup(row: ReturnType<typeof rowOf>) {
	const onAction = vi.fn();
	render(
		<AriaGridList aria-label="Subscriptions">
			<SubscriptionRow
				row={row}
				formats={FORMATS}
				onAction={onAction}
			/>
		</AriaGridList>,
	);
	return { onAction, user: userEvent.setup() };
}

const netflix = subscriptionItem("netflix");
const prime = subscriptionItem("amazonPrime");

/** The pieces that only one layout shows are hidden by a breakpoint class: jsdom has no
 * stylesheet, so a test names the piece and checks its class. */
const wideOnly = (el: HTMLElement) =>
	expect(el.closest(".max-md\\:hidden")).not.toBeNull();
const phoneOnly = (el: HTMLElement) =>
	expect(el.closest(".md\\:hidden")).not.toBeNull();
const always = (el: HTMLElement) => {
	expect(el.closest(".max-md\\:hidden")).toBeNull();
	expect(el.closest(".md\\:hidden")).toBeNull();
};
const row = () => screen.getByRole("row");

describe("the row's content (BR-F05-22, AC-F05-34)", () => {
	test("reads the next due date over how far off it is, in the date column", () => {
		setup(rowOf(netflix));
		const top = within(row()).getByText("Thu, 5 Nov", {
			selector: ".font-semibold",
		});
		wideOnly(top);
		const sub = within(row()).getByText("in 3 days");
		wideOnly(sub);
	});

	test("the name, the category and the amount show at every width", () => {
		setup(rowOf(netflix));
		always(within(row()).getByText("Netflix"));
		always(within(row()).getByText("Entertainment"));
		always(within(row()).getByText("₹649.00"));
		always(within(row()).getByText("a month"));
	});

	test("a monthly Subscription has no monthly line", () => {
		setup(rowOf(netflix));
		expect(within(row()).queryByText(/≈/)).toBeNull();
	});

	test("a yearly one adds its monthly equivalent, for wide rows, and a date outside the year has no weekday", () => {
		setup(rowOf(prime));
		always(within(row()).getByText("₹1,499.00"));
		always(within(row()).getByText("a year"));
		wideOnly(within(row()).getByText("≈ ₹124.92 a month"));
		wideOnly(
			within(row()).getByText("12 Oct 2027", { selector: ".font-semibold" }),
		);
		wideOnly(within(row()).getByText("in 11 months"));
	});

	test("a due date of today reads today", () => {
		setup(rowOf(made("Today", { nextDueOn: "2026-11-02" })));
		expect(screen.getByText("today")).toBeVisible();
	});

	test("the row is named by its whole reading, name first", () => {
		setup(rowOf(netflix));
		expect(row()).toHaveAccessibleName(
			"Netflix, Entertainment, ₹649.00 a month, Thu, 5 Nov in 3 days",
		);
	});
});

describe("the two layouts are CSS, so the server's HTML is the final one (D-625)", () => {
	test("the grid has two columns on a phone and four from 768 px", () => {
		setup(rowOf(netflix));
		expect(row()).toHaveClass("grid-cols-[minmax(0,1fr)_auto]");
		expect(row().className).toContain(
			"md:grid-cols-[8rem_minmax(0,1fr)_11.25rem_2.5rem]",
		);
	});

	test("the date column and the menu are for wide rows only", () => {
		setup(rowOf(netflix));
		wideOnly(within(row()).getByText("in 3 days"));
		wideOnly(screen.getByRole("button", { name: "Actions for Netflix" }));
	});

	test("the phone's date line sits under the amount, and wide rows have the monthly equivalent instead", () => {
		setup(rowOf(prime));
		const phone = within(row()).getByText("12 Oct 2027", {
			selector: ".text-caption",
		});
		phoneOnly(phone);
		wideOnly(within(row()).getByText("≈ ₹124.92 a month"));
	});

	test("the category sits beside the name on wide rows and under the badges on a phone", () => {
		setup(
			rowOf(made("Hotstar", { status: "upcoming", startDate: "2026-12-05" })),
		);
		const category = within(row())
			.getByText("Entertainment")
			.closest("span.inline-flex") as HTMLElement;
		expect(category).toHaveClass("max-md:order-last", "max-md:basis-full");
	});

	test("an ended row's phone line reads Ended and its end date", () => {
		setup(rowOf(endedOn("Old plan", "2026-09-30")));
		phoneOnly(within(row()).getByText("Ended 30 Sept"));
	});

	test("a row with no next due has no phone line", () => {
		setup(rowOf(made("Club", { nextDueOn: null })));
		expect(within(row()).queryByText(/Nov|Dec/)).toBeNull();
	});

	test("there is one of each piece, so a reader gets no double", () => {
		setup(rowOf(netflix));
		expect(within(row()).getAllByText("Netflix")).toHaveLength(1);
		expect(within(row()).getAllByText("Entertainment")).toHaveLength(1);
		expect(within(row()).getAllByText("₹649.00")).toHaveLength(1);
	});
});

describe("the menu", () => {
	test("is named for the Subscription", () => {
		setup(rowOf(netflix));
		expect(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		).toBeVisible();
	});

	test("offers View charges and runs it with the row's id", async () => {
		const { user, onAction } = setup(rowOf(netflix));
		await user.click(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		);
		await user.click(screen.getByRole("menuitem", { name: "View charges" }));
		expect(onAction).toHaveBeenCalledExactlyOnceWith("viewCharges", netflix.id);
	});

	test("offers only what is built so far", async () => {
		const { user } = setup(rowOf(netflix));
		await user.click(
			screen.getByRole("button", { name: "Actions for Netflix" }),
		);
		expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
			"View charges",
		]);
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
	});

	test("an ending badge has no icon", () => {
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
		expect(
			screen.getByText("Ended", { selector: ".font-semibold" }),
		).toBeVisible();
		expect(screen.getByText("30 Sept 2026")).toBeVisible();
	});

	test("is dimmed", () => {
		setup(rowOf(ended));
		expect(
			screen.getByText("Ended", { selector: ".font-semibold" }),
		).toHaveClass("text-ink-2");
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
