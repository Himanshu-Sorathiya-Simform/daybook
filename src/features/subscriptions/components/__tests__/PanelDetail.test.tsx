import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import {
	ok,
	refuse,
	route,
	type Seen,
	testClient,
} from "../../hooks/__tests__/helpers";
import type { SubscriptionItem } from "../../lib/types";
import { charge, listPage, subscriptionItem } from "../../lib/__tests__/fixtures";
import { PanelDetail } from "../PanelDetail";
import { FORMATS } from "./rows";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const IN = { ...FORMATS };
const NETFLIX = subscriptionItem("netflix");

const paid = (
	item: SubscriptionItem,
	dueOn: string,
	changes: Parameters<typeof charge>[0] = {},
) =>
	charge({
		subscriptionId: item.id,
		dueOn,
		occurredOn: dueOn,
		amountMinor: item.amountMinor,
		...changes,
	});

function setup(
	item: SubscriptionItem = NETFLIX,
	charges:
		| ReturnType<typeof charge>[]
		| ((request: Seen) => Response | Promise<Response>) = [
		paid(NETFLIX, "2026-09-05"),
		paid(NETFLIX, "2026-10-05"),
	],
	selectedDue: string | null = null,
) {
	const reads = route(
		network,
		"get",
		"/api/transactions",
		Array.isArray(charges) ? () => ok(listPage(charges)) : charges,
	);
	const onClose = vi.fn();
	const onViewCharges = vi.fn();
	const onAction = vi.fn();
	const client = testClient();
	const element = (due: string | null) => (
		<AppProviders
			navigate={vi.fn()}
			queryClient={client}
		>
			<PanelDetail
				item={item}
				formats={IN}
				onClose={onClose}
				onViewCharges={onViewCharges}
				onAction={onAction}
				selectedDue={due}
			/>
		</AppProviders>
	);
	const view = render(element(selectedDue));
	return {
		reads,
		onClose,
		onViewCharges,
		onAction,
		again: (due: string | null) => view.rerender(element(due)),
		user: userEvent.setup(),
	};
}

const lines = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("the header and figures (BR-F05-40, AC-F05-37)", () => {
	test("labels the panel Subscription and names the Subscription with its category", async () => {
		setup();
		expect(screen.getByRole("heading", { name: "Subscription" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "Netflix" })).toBeVisible();
		expect(screen.getByText("Entertainment")).toBeVisible();
		await screen.findByRole("list");
	});

	test("shows the amount large with its cadence, and the schedule line under it", async () => {
		setup();
		expect(screen.getByText("₹649.00")).toBeVisible();
		expect(screen.getByText("a month")).toBeVisible();
		expect(
			screen.getByText(
				"Every month on the 5th, since 5 Sept 2026 · ₹7,788.00 a year",
			),
		).toBeVisible();
		await screen.findByRole("list");
	});

	test("a yearly Subscription adds its monthly equivalent to the line", async () => {
		const prime = subscriptionItem("amazonPrime");
		setup(prime, [paid(prime, "2026-10-12")]);
		expect(screen.getByText("a year")).toBeVisible();
		expect(screen.getByText(/≈ ₹124\.92 a month/)).toBeVisible();
		await screen.findByRole("list");
	});

	test("badges: Ends for an ending one, Paused until for a paused one", async () => {
		setup(
			subscriptionItem("netflix", { status: "ending", endDate: "2026-12-31" }),
		);
		expect(screen.getByText("Ends 31 Dec 2026")).toBeVisible();
		await screen.findByRole("list");
		cleanup();
		setup(
			subscriptionItem("netflix", {
				status: "paused",
				nextDueOn: "2027-01-05",
				pause: { from: "2026-11-05", until: "2027-01-05" },
			}),
		);
		const badge = screen.getByText("Paused until 5 Jan 2027");
		expect(badge.querySelector("svg")).not.toBeNull();
		await screen.findByRole("list");
	});

	test("an upcoming one reads Starts", async () => {
		setup(
			subscriptionItem("netflix", {
				status: "upcoming",
				startDate: "2026-12-05",
				nextDueOn: "2026-12-05",
			}),
			[],
		);
		expect(screen.getByText("Starts 5 Dec")).toBeVisible();
		await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
	});

	test("a long name wraps and is the whole name", async () => {
		const name =
			"A very long Subscription name that goes on and on until it wraps";
		setup(subscriptionItem("netflix", { name }));
		expect(screen.getByRole("heading", { name })).toHaveClass("break-words");
		await screen.findByRole("list");
	});
});

describe("the pinned header (D-621)", () => {
	test("the header row stays at the panel's top edge while the rest scrolls", async () => {
		setup();
		const header = screen.getByRole("heading", {
			name: "Subscription",
		}).parentElement;
		expect(header).toHaveClass(
			"sticky",
			"-top-5",
			"-mt-5",
			"pt-5",
			"z-10",
			"bg-section",
		);
		await screen.findByRole("list");
	});
});

describe("the status box and the buttons built so far", () => {
	test("reads the next charge, with no button yet", async () => {
		setup();
		expect(screen.getByText(/Next charge/).parentElement).toHaveTextContent(
			"Next charge Thu, 5 Nov, in 3 days.",
		);
		expect(screen.queryByRole("button", { name: "Skip this one" })).toBeNull();
		await screen.findByRole("list");
	});

	test("the footer has Edit, and no Pause, Cancel or Delete until their dialogs exist", async () => {
		setup();
		await screen.findByRole("list");
		expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
		for (const name of ["Pause", "Cancel Subscription", "Delete", "Resume"]) {
			expect(screen.queryByRole("button", { name })).toBeNull();
		}
	});

	test("Edit asks to edit this Subscription", async () => {
		const { user, onAction } = setup();
		await screen.findByRole("list");
		await user.click(screen.getByRole("button", { name: "Edit" }));
		expect(onAction).toHaveBeenCalledExactlyOnceWith("edit");
	});

	test("the key hint names the Edit key", async () => {
		setup();
		expect(
			screen.getByText("E to edit · Up and down arrows move · Esc to close"),
		).toBeVisible();
		await screen.findByRole("list");
	});
});

describe("Close details and View charges", () => {
	test("Close details asks to close", async () => {
		const { user, onClose } = setup();
		await user.click(screen.getByRole("button", { name: "Close details" }));
		expect(onClose).toHaveBeenCalledOnce();
		await screen.findByRole("list");
	});

	test("View charges asks to open the Subscription's charges", async () => {
		const { user, onViewCharges } = setup();
		await user.click(
			await screen.findByRole("button", { name: "View charges" }),
		);
		expect(onViewCharges).toHaveBeenCalledOnce();
	});

	test("Paid so far names the sum and count, from the list's figures", async () => {
		setup();
		expect(screen.getByText("Paid so far ₹1,298.00 · 2 charges")).toBeVisible();
		await screen.findByRole("list");
	});

	test("one charge reads 1 charge", async () => {
		const cult = subscriptionItem("cultGym");
		setup(cult, [paid(cult, "2026-09-10")]);
		expect(screen.getByText("Paid so far ₹1,500.00 · 1 charge")).toBeVisible();
		await screen.findByRole("list");
	});

	test("no charge reads no Paid so far and no View charges", async () => {
		const none = subscriptionItem("netflix", { chargeCount: 0, paidMinor: 0 });
		setup(none, []);
		await screen.findByRole("list");
		expect(screen.queryByText(/Paid so far/)).toBeNull();
		expect(screen.queryByRole("button", { name: "View charges" })).toBeNull();
	});
});

describe("the charges (BR-F05-40, BR-F05-48, AC-F05-33)", () => {
	test("asks for the Subscription's whole charges once", async () => {
		const { reads } = setup();
		await screen.findByRole("list");
		expect(reads).toHaveLength(1);
		expect(reads[0]!.path).toContain(`sub=${NETFLIX.id}`);
		expect(reads[0]!.path).toContain("limit=100");
		expect(reads[0]!.path).toContain("group=none");
	});

	test("shows skeleton lines while they load, as a busy status", async () => {
		setup(NETFLIX, async () => {
			await delay("infinite");
			return ok(listPage([]));
		});
		const loading = screen.getByRole("status", { name: "Loading charges" });
		expect(loading).toHaveAttribute("aria-busy", "true");
		expect(screen.queryByRole("list")).toBeNull();
	});

	describe("the skeleton holds the timeline's place (BR-F05-40)", () => {
		const waiting = async () => {
			await delay("infinite");
			return ok(listPage([]));
		};
		const placeholderLines = () =>
			screen
				.getByRole("status", { name: "Loading charges" })
				.querySelectorAll(".py-2\\.5");

		test("as many lines as the timeline will have: Netflix's 2 charges and 2 to come make 4", () => {
			setup(NETFLIX, waiting);
			expect(placeholderLines()).toHaveLength(4);
		});

		test("a skipped date counts: Cult Gym's one charge, one skip and two to come make 4", () => {
			setup(subscriptionItem("cultGym"), waiting);
			expect(placeholderLines()).toHaveLength(4);
		});

		test("never more than 7, with a button-sized bar for Show all", () => {
			setup(
				subscriptionItem("netflix", { chargeCount: 30, paidMinor: 1946700 }),
				waiting,
			);
			expect(placeholderLines()).toHaveLength(7);
			expect(
				screen
					.getByRole("status", { name: "Loading charges" })
					.querySelector(".h-8"),
			).not.toBeNull();
		});

		test("an ended Subscription with no charge holds one line of text, for No charges yet.", () => {
			setup(
				subscriptionItem("netflix", {
					status: "ended",
					endDate: "2026-09-04",
					nextDueOn: null,
					chargeCount: 0,
					paidMinor: 0,
				}),
				waiting,
			);
			expect(placeholderLines()).toHaveLength(0);
		});

		test("the real timeline takes the same number of lines when it arrives", async () => {
			setup();
			await screen.findByRole("list");
			expect(lines()).toHaveLength(4);
		});

		test("the skeleton goes when the charges arrive, and so does its status", async () => {
			setup();
			expect(
				screen.getByRole("status", { name: "Loading charges" }),
			).toBeVisible();
			await screen.findByRole("list");
			expect(
				screen.queryByRole("status", { name: "Loading charges" }),
			).toBeNull();
		});
	});

	test("lists the timeline newest first once they load", async () => {
		setup();
		await screen.findByRole("list");
		expect(lines().map((li) => li.textContent)).toEqual([
			"5 Dec 2026₹649.00After that",
			"5 Nov 2026₹649.00Next. Added to Transactions on the day.",
			"5 Oct 2026₹649.00Charged",
			"5 Sept 2026₹649.00Charged",
		]);
		expect(screen.queryByRole("status")).toBeNull();
	});

	test("a failed read says so with Retry, never part of the set, and Retry loads them", async () => {
		let fail = true;
		const { user, reads } = setup(NETFLIX, () =>
			fail ?
				refuse(500, "internal_error")
			:	ok(listPage([paid(NETFLIX, "2026-10-05")])),
		);
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Charges could not be loaded.");
		expect(screen.queryByRole("list")).toBeNull();
		fail = false;
		await user.click(screen.getByRole("button", { name: "Retry" }));
		await screen.findByRole("list");
		expect(screen.queryByRole("alert")).toBeNull();
		expect(reads.length).toBe(2);
	});

	test("a failing second page shows the failure, not the first page's rows", async () => {
		const first = Array.from({ length: 2 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 8}-05`),
		);
		setup(NETFLIX, (request) =>
			request.path.includes("cursor=") ?
				refuse(500, "internal_error")
			:	ok({ ...listPage(first), nextCursor: "next-page" }),
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Charges could not be loaded.",
		);
		expect(screen.queryByRole("list")).toBeNull();
	});

	test("no charge and nothing to come reads No charges yet.", async () => {
		const ended = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-09-04",
			nextDueOn: null,
			chargeCount: 0,
			paidMinor: 0,
		});
		setup(ended, []);
		expect(await screen.findByText("No charges yet.")).toBeVisible();
		expect(screen.queryByRole("list")).toBeNull();
	});

	test("a skipped date and an edited charge read as such", async () => {
		const cult = subscriptionItem("cultGym");
		setup(cult, [paid(cult, "2026-09-10", { edited: true })]);
		await screen.findByRole("list");
		expect(screen.getByText("Charged · edited")).toBeVisible();
		expect(
			screen.getByText("You deleted this charge. Daybook won't add it again."),
		).toBeVisible();
	});

	test("more than 7 lines show 7 with Show all, and Show fewer goes back", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		const { user } = setup(NETFLIX, many);
		await screen.findByRole("list");
		expect(lines()).toHaveLength(7);
		await user.click(screen.getByRole("button", { name: /^Show all/ }));
		expect(lines().length).toBeGreaterThan(7);
		await user.click(screen.getByRole("button", { name: "Show fewer" }));
		expect(lines()).toHaveLength(7);
	});

	test("no Undo skip button, even for a skipped future date", async () => {
		setup(subscriptionItem("netflix", { skips: ["2026-11-05"] }), []);
		await screen.findByText("You skipped it.");
		expect(screen.queryByRole("button", { name: "Undo skip" })).toBeNull();
	});
});

describe("the date the calendar marks (BR-F05-38)", () => {
	const marked = () =>
		lines().filter((line) => line.classList.contains("bg-accent-soft"));

	// AC-F05-40
	test("tints the line of that date", async () => {
		setup(NETFLIX, undefined, "2026-10-05");
		await screen.findByRole("list");
		expect(marked()).toHaveLength(1);
		expect(marked()[0]).toHaveTextContent("5 Oct 2026");
	});

	test("with no date marked no line is tinted", async () => {
		setup();
		await screen.findByRole("list");
		expect(marked()).toHaveLength(0);
	});

	test("a date the timeline does not hold marks nothing", async () => {
		setup(NETFLIX, undefined, "2026-10-06");
		await screen.findByRole("list");
		expect(marked()).toHaveLength(0);
	});

	test("a mark within the first 7 lines leaves the rest folded", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		setup(NETFLIX, many, "2026-09-05");
		await screen.findByRole("list");
		expect(lines()).toHaveLength(7);
		expect(screen.getByRole("button", { name: /^Show all/ })).toBeVisible();
	});

	// AC-F05-40
	test("a mark past the first 7 lines opens the rest so it shows", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		setup(NETFLIX, many, "2026-01-05");
		await screen.findByRole("list");
		expect(lines().length).toBeGreaterThan(7);
		expect(marked()).toHaveLength(1);
		expect(marked()[0]).toHaveTextContent("5 Jan 2026");
		expect(screen.getByRole("button", { name: "Show fewer" })).toBeVisible();
	});

	test("a mark on the 8th line, the first folded one, opens the rest", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		setup(NETFLIX, many, "2026-04-05");
		await screen.findByRole("list");
		expect(marked()[0]).toHaveTextContent("5 Apr 2026");
		expect(screen.getByRole("button", { name: "Show fewer" })).toBeVisible();
	});

	test("a mark on the 7th line, the last shown, leaves it folded", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		setup(NETFLIX, many, "2026-05-05");
		await screen.findByRole("list");
		expect(lines()).toHaveLength(7);
		expect(marked()[0]).toHaveTextContent("5 May 2026");
	});

	test("Show fewer folds it and it stays folded for that date", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		const { user, again } = setup(NETFLIX, many, "2026-01-05");
		await screen.findByRole("list");
		await user.click(screen.getByRole("button", { name: "Show fewer" }));
		expect(lines()).toHaveLength(7);
		again("2026-01-05");
		expect(lines()).toHaveLength(7);
	});

	test("another date past the 7 lines opens it again after a fold", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		const { user, again } = setup(NETFLIX, many, "2026-01-05");
		await screen.findByRole("list");
		await user.click(screen.getByRole("button", { name: "Show fewer" }));
		again("2026-02-05");
		expect(lines().length).toBeGreaterThan(7);
		expect(marked()[0]).toHaveTextContent("5 Feb 2026");
	});

	test("clearing the mark leaves what was opened as it is", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		const { again } = setup(NETFLIX, many, "2026-01-05");
		await screen.findByRole("list");
		again(null);
		expect(marked()).toHaveLength(0);
		expect(lines()).toHaveLength(7);
	});

	test("Show all still works with no mark", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			paid(NETFLIX, `2026-0${i + 1}-05`),
		);
		const { user } = setup(NETFLIX, many);
		await screen.findByRole("list");
		await user.click(screen.getByRole("button", { name: /^Show all/ }));
		expect(lines().length).toBeGreaterThan(7);
	});
});

describe("the note (BR-F05-40)", () => {
	test("shows a note in full under Note", async () => {
		setup(
			subscriptionItem("netflix", { note: "Family plan\nshared with Asha" }),
		);
		const section = screen.getByRole("region", { name: "Note" });
		expect(section).toHaveTextContent("Family plan");
		expect(within(section).getByText(/Family plan/)).toHaveClass(
			"whitespace-pre-line",
		);
		await screen.findByRole("list");
	});

	test("with no note there is no Note section, but an Add a note that opens Edit", async () => {
		const { user, onAction } = setup();
		await screen.findByRole("list");
		expect(screen.queryByRole("region", { name: "Note" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Add a note" }));
		expect(onAction).toHaveBeenCalledExactlyOnceWith("edit");
	});

	test("with a note there is no Add a note", async () => {
		setup(subscriptionItem("netflix", { note: "Family plan" }));
		await screen.findByRole("list");
		expect(screen.getByRole("region", { name: "Note" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
	});
});
