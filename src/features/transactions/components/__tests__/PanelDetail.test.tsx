import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import type { LabelLocale } from "../../lib/labels";
import { row } from "../../lib/__tests__/fixtures";
import type { PayeeHistoryAnswer, TransactionAnswer } from "../../lib/types";
import { PanelDetail } from "../PanelDetail";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

// The golden profile (IN, INR) on the golden clock's day (TST-3).
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

const history = (
	overrides: Partial<PayeeHistoryAnswer> = {},
): PayeeHistoryAnswer => ({
	count: 4,
	inMinor: 0,
	outMinor: 329000,
	usualDay: 3,
	currency: "INR",
	...overrides,
});

// Golden rows as the API answers them at M1 (F03 section 5).
const ROW_13 = row({
	type: "income",
	amountMinor: 8500000,
	occurredOn: "2026-10-01",
	occurredAt: "2026-10-01T04:35:00.000Z",
	category: "salary",
	payee: "Acme Corp",
});
const ROW_11 = row({
	type: "income",
	amountMinor: 1200000,
	occurredOn: "2026-09-25",
	occurredAt: "2026-09-25T06:30:00.000Z",
	category: "freelance",
	payee: "Studio Nine",
});
const ROW_16 = row({
	amountMinor: 64900,
	occurredOn: "2026-10-05",
	occurredAt: "2026-10-04T18:30:00.000Z",
	category: "entertainment",
	payee: "Netflix",
	source: "subscription",
	dueOn: "2026-10-05",
});

function renderDetail(
	shown: TransactionAnswer = row(),
	{
		isOnline = true,
		answer = () => ok(history()),
	}: { isOnline?: boolean; answer?: Parameters<typeof route>[3] } = {},
) {
	const asked = route(network, "get", "/api/payees/history", answer);
	const onClose = vi.fn();
	const onEdit = vi.fn();
	const onDuplicate = vi.fn();
	const view = renderInApp(
		<PanelDetail
			row={shown}
			locale={IN}
			isOnline={isOnline}
			onClose={onClose}
			onEdit={onEdit}
			onDuplicate={onDuplicate}
		/>,
	);
	return { ...view, asked, onClose, onEdit, onDuplicate, user: userEvent.setup() };
}

/** The detail rows, term to value. */
const details = () =>
	Object.fromEntries(
		screen
			.getAllByRole("term")
			.map((term) => [term.textContent, term.nextElementSibling?.textContent]),
	);

describe("PanelDetail (BR-F03-72)", () => {
	// AC-F03-57
	test("#24: the top, the details and Swiggy's last 3 months", async () => {
		const { asked } = renderDetail();

		expect(
			screen.getByRole("heading", { name: "Transaction" }),
		).toBeInTheDocument();
		expect(screen.getByText("Swiggy")).toBeInTheDocument();
		expect(screen.getByText("−₹640.00")).toBeInTheDocument();
		expect(details()).toEqual({
			Type: "Expense",
			Category: "Food",
			Date: "Mon, 19 Oct, 2026 · 10:15 pm",
			Source: "Added by you",
			Note: "None",
		});
		const box = await screen.findByRole("region", {
			name: "Swiggy in the last 3 months",
		});
		expect(box).toHaveTextContent(
			"4 Transactions · ₹3,290.00 · usually around the 3rd",
		);
		expect(asked.map((each) => each.path)).toEqual([
			"/api/payees/history?payee=Swiggy&months=3",
		]);
	});

	// AC-F03-57
	test("#13: income shows a plus and Acme Corp's In", async () => {
		renderDetail(ROW_13, {
			answer: () =>
				ok(
					history({
						count: 2,
						inMinor: 17000000,
						outMinor: 0,
						usualDay: 1,
					}),
				),
		});

		expect(screen.getByText("+₹85,000.00")).toBeInTheDocument();
		expect(
			await screen.findByText(
				"2 Transactions · ₹1,70,000.00 · usually around the 1st",
			),
		).toBeInTheDocument();
	});

	// AC-F03-57
	test("#11: one row has no usual day", async () => {
		renderDetail(ROW_11, {
			answer: () =>
				ok(
					history({
						count: 1,
						inMinor: 1200000,
						outMinor: 0,
						usualDay: null,
					}),
				),
		});

		expect(
			await screen.findByText("1 Transaction · ₹12,000.00"),
		).toBeInTheDocument();
	});

	// AC-F03-57
	test("#16 at M1: Auto, from a deleted Subscription, and Netflix's charges", async () => {
		renderDetail(ROW_16, {
			answer: () => ok(history({ count: 2, outMinor: 129800, usualDay: 5 })),
		});

		expect(details()).toMatchObject({
			Date: "Mon, 5 Oct, 2026 · Auto",
			Source: "From a deleted Subscription",
		});
		expect(
			await screen.findByText(
				"2 Transactions · ₹1,298.00 · usually around the 5th",
			),
		).toBeInTheDocument();
	});

	test("a description shows under the title, and a note in full", () => {
		renderDetail(row({ description: "Team dinner", note: "Split\nwith Asha" }));

		expect(screen.getByText("Team dinner")).toBeInTheDocument();
		expect(details()["Note"]).toBe("Split\nwith Asha");
	});

	// BR-F03-70
	test("holds the box's place with skeleton lines while the history loads", async () => {
		let release = () => {};
		const { asked } = renderDetail(row(), {
			answer: () =>
				new Promise((resolve) => {
					release = () => resolve(ok(history()));
				}),
		});

		await waitFor(() => expect(asked).toHaveLength(1));
		expect(
			screen.getByRole("status", {
				name: "Loading Swiggy in the last 3 months",
			}),
		).toHaveAttribute("aria-busy", "true");
		release();

		expect(
			await screen.findByRole("region", {
				name: "Swiggy in the last 3 months",
			}),
		).toBeInTheDocument();
		expect(screen.queryByRole("status")).toBeNull();
	});

	test("offline, no skeleton waits for a history that can't come", () => {
		renderDetail(row(), { isOnline: false });

		expect(screen.queryByRole("status")).toBeNull();
	});

	test("a Goal row asks for no history, so no skeleton shows", () => {
		renderDetail(
			row({ type: "goal_contribution", category: null, payee: null }),
		);

		expect(screen.queryByRole("status")).toBeNull();
	});

	// AC-F03-57
	test("a failed history request leaves the box out and the rest in place", async () => {
		const { asked } = renderDetail(row(), {
			answer: () => refuse(500, "internal"),
		});

		await waitFor(() => expect(asked).toHaveLength(1));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.queryByRole("region")).toBeNull();
		expect(details()["Type"]).toBe("Expense");
		expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
	});

	test("a payee with no rows in 3 months has no box", async () => {
		const { asked } = renderDetail(row(), {
			answer: () => ok(history({ count: 0, outMinor: 0, usualDay: null })),
		});

		await waitFor(() => expect(asked).toHaveLength(1));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.queryByRole("region")).toBeNull();
	});

	test("offline, the box is left out even with the history cached", async () => {
		const { queryClient } = renderDetail(row(), { isOnline: false });

		await waitFor(() => expect(queryClient.isFetching()).toBe(0));
		expect(screen.queryByRole("region")).toBeNull();
	});

	test("a row whose payee the server would refuse asks for no history", async () => {
		const { asked } = renderDetail(row({ payee: "  " }));

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(asked).toEqual([]);
	});

	test("Close, Edit and Duplicate each call the page", async () => {
		const { user, onClose, onEdit, onDuplicate } = renderDetail();

		await user.click(screen.getByRole("button", { name: "Close details" }));
		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("button", { name: "Duplicate" }));

		expect(onClose).toHaveBeenCalledOnce();
		expect(onEdit).toHaveBeenCalledOnce();
		expect(onDuplicate).toHaveBeenCalledOnce();
	});

	test("ends with the keys' hint", () => {
		renderDetail();

		expect(
			screen.getByText("E to edit · D to duplicate · Esc to close"),
		).toBeInTheDocument();
	});

	test("a Goal row reads To Goal, asks for no history and has no actions until M2", async () => {
		const { asked } = renderDetail(
			row({ type: "goal_contribution", category: null, payee: null }),
		);

		// The title and the Type row.
		expect(screen.getAllByText("To Goal")).toHaveLength(2);
		expect(details()["Goal"]).toBe("Goal");
		expect(screen.getByText("−₹640.00")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(asked).toEqual([]);
	});

	test("a refund shows a plus, as money back", () => {
		renderDetail(row({ type: "refund", category: "shopping" }));

		expect(screen.getByText("+₹640.00")).toBeInTheDocument();
	});
});
