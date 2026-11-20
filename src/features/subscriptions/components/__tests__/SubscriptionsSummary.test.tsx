import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Formats } from "../../lib/labels";
import { emptyList, subscriptionList } from "../../lib/__tests__/fixtures";
import { SubscriptionsSummary } from "../SubscriptionsSummary";

// The golden profile at the golden clock (TST-3).
const F: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
	today: "2026-11-02",
};

describe("SubscriptionsSummary, golden at 2 November (BR-F05-21)", () => {
	test("the monthly cost is the readout, read as one amount", () => {
		render(
			<SubscriptionsSummary
				list={subscriptionList()}
				formats={F}
			/>,
		);
		expect(screen.getByText("Monthly cost")).toBeVisible();
		expect(screen.getByText("₹20,273.92")).toBeInTheDocument();
	});

	test("the yearly cost and the count of Subscriptions", () => {
		render(
			<SubscriptionsSummary
				list={subscriptionList()}
				formats={F}
			/>,
		);
		expect(
			screen.getByText("₹2,43,287.00 a year · 4 Subscriptions"),
		).toBeVisible();
	});

	test("the month's name and total, charged and still to come", () => {
		render(
			<SubscriptionsSummary
				list={subscriptionList()}
				formats={F}
			/>,
		);
		expect(screen.getByText("November")).toBeVisible();
		expect(screen.getByText("₹20,149.00 in all")).toBeVisible();
		expect(screen.getByText("Charged ₹18,000.00")).toBeVisible();
		expect(screen.getByText("Still to come ₹2,149.00")).toBeVisible();
	});

	test("the next 30 days with their count and total", () => {
		render(
			<SubscriptionsSummary
				list={subscriptionList()}
				formats={F}
			/>,
		);
		expect(screen.getByText("Next 30 days · 3 charges")).toBeVisible();
		expect(screen.getByText("₹20,149.00")).toBeVisible();
	});

	test("the bar is hidden from screen readers and filled to the charged share", () => {
		const { container } = render(
			<SubscriptionsSummary
				list={subscriptionList()}
				formats={F}
			/>,
		);
		const fill = container.querySelector<HTMLElement>('[data-part="charged"]');
		expect(fill?.parentElement).toHaveAttribute("aria-hidden", "true");
		expect(parseFloat(fill?.style.width ?? "")).toBeCloseTo(
			(1800000 / 2014900) * 100,
			5,
		);
	});
});

describe("SubscriptionsSummary edge cases", () => {
	test("one Subscription and one charge use the singular", () => {
		render(
			<SubscriptionsSummary
				list={subscriptionList({
					totals: { monthlyMinor: 64900, yearlyMinor: 778800, count: 1 },
					upcoming: subscriptionList().upcoming.slice(0, 1),
					upcomingTotalMinor: 64900,
				})}
				formats={F}
			/>,
		);
		expect(screen.getByText("₹7,788.00 a year · 1 Subscription")).toBeVisible();
		expect(screen.getByText("Next 30 days · 1 charge")).toBeVisible();
	});

	test("Subscriptions with no next due date add nothing: no count, no charge coming", () => {
		const { container } = render(
			<SubscriptionsSummary
				list={{
					...emptyList(),
					items: subscriptionList().items,
				}}
				formats={F}
			/>,
		);
		expect(screen.getByText("₹0.00 a year · 0 Subscriptions")).toBeVisible();
		expect(screen.getByText("Next 30 days · 0 charges")).toBeVisible();
		expect(
			container.querySelector<HTMLElement>('[data-part="charged"]')?.style
				.width,
		).toBe("0%");
	});

	test("a month with everything charged fills the bar", () => {
		const { container } = render(
			<SubscriptionsSummary
				list={subscriptionList({
					thisMonth: { chargedMinor: 1800000, toComeMinor: 0 },
				})}
				formats={F}
			/>,
		);
		expect(
			container.querySelector<HTMLElement>('[data-part="charged"]')?.style
				.width,
		).toBe("100%");
		expect(screen.getByText("Still to come ₹0.00")).toBeVisible();
	});

	test("follows the profile's currency and formats", () => {
		render(
			<SubscriptionsSummary
				list={subscriptionList({ currency: "USD" })}
				formats={{
					...F,
					currency: "USD",
					numberLocale: "en-US",
					dateLocale: "en-US",
				}}
			/>,
		);
		expect(
			screen.getByText("$243,287.00 a year · 4 Subscriptions"),
		).toBeVisible();
		expect(screen.getByText("Charged $18,000.00")).toBeVisible();
	});

	test("the month is the one of the profile's today", () => {
		render(
			<SubscriptionsSummary
				list={subscriptionList()}
				formats={{ ...F, today: "2026-12-31" }}
			/>,
		);
		expect(screen.getByText("December")).toBeVisible();
	});
});
