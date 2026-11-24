import { describe, expect, test } from "vitest";

import { RESUME_TEXT, resumeView } from "../resume";
import type { SubscriptionItem, SubscriptionsLocale } from "../types";
import { charge, subscriptionItem, IN_LOCALE as IN } from "./fixtures";

const NOW = "2026-11-02T06:30:00.000Z";

/** Netflix cancelled on 30 September, after its 5 September charge. */
const ENDED = subscriptionItem("netflix", {
	status: "ended",
	endDate: "2026-09-30",
	nextDueOn: null,
});
const ENDING = subscriptionItem("netflix", {
	status: "ending",
	endDate: "2026-12-31",
});

const paid = (item: SubscriptionItem, dueOn: string) =>
	charge({
		subscriptionId: item.id,
		dueOn,
		occurredOn: dueOn,
		amountMinor: item.amountMinor,
	});
const SEPT = [paid(ENDED, "2026-09-05")];

const view = (
	over: Partial<Parameters<typeof resumeView>[0]> = {},
	item: SubscriptionItem = ENDED,
) =>
	resumeView({
		item,
		charges: SEPT,
		never: false,
		newAmountMinor: null,
		locale: IN,
		changedAt: NOW,
		...over,
	});

describe("how it opens (BR-F05-42)", () => {
	test("an ended one says where it ended and after which charge", () => {
		expect(view().opening).toBe("Ended 30 Sept 2026, after the 5 Sept charge");
	});

	test("with no charge it says only where it ended", () => {
		expect(view({ charges: [] }).opening).toBe("Ended 30 Sept 2026");
	});

	test("the latest charge is the one named", () => {
		expect(
			view({ charges: [paid(ENDED, "2026-09-05"), paid(ENDED, "2026-09-20")] })
				.opening,
		).toBe("Ended 30 Sept 2026, after the 20 Sept charge");
	});

	test("an ending one says when it ends", () => {
		expect(view({}, ENDING).opening).toBe("Ends 31 Dec 2026");
	});
});

describe("the missed charges (BR-F05-32, BR-F05-42)", () => {
	// AC-F05-48
	test("offers it never stopped when due dates passed after the end", () => {
		const found = view();
		expect(found.gap).toEqual(["2026-10-05"]);
		expect(found.choices?.never).toEqual({
			title: "It never actually stopped",
			description: "Also adds the 1 missed charge: 5 Oct, ₹649.00.",
		});
		expect(found.plainLine).toBeNull();
	});

	test("two missed charges read in the plural with one total", () => {
		const later: SubscriptionsLocale = { ...IN, today: "2026-11-10" };
		const found = resumeView({
			item: ENDED,
			charges: SEPT,
			never: false,
			newAmountMinor: null,
			locale: later,
			changedAt: NOW,
		});
		expect(found.choices?.never.description).toBe(
			"Also adds the 2 missed charges: 5 Oct, 5 Nov, ₹1,298.00.",
		);
	});

	test("more than three dates end in an ellipsis before the total", () => {
		const weekly = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-09-30",
			cadence: { unit: "week", every: 1 },
			startDate: "2026-09-04",
		});
		const found = view({ charges: [] }, weekly);
		expect(found.gap.length).toBeGreaterThan(3);
		expect(found.choices?.never.description).toMatch(
			/^Also adds the \d+ missed charges: .+, .+, .+…, ₹/,
		);
	});

	test("exactly three missed dates are all named, with no ellipsis", () => {
		const longer = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-07-31",
			startDate: "2026-05-05",
			nextDueOn: null,
		});
		const found = view({ charges: [] }, longer);
		expect(found.gap).toEqual(["2026-08-05", "2026-09-05", "2026-10-05"]);
		expect(found.choices?.never.description).toBe(
			"Also adds the 3 missed charges: 5 Aug, 5 Sept, 5 Oct, ₹1,947.00.",
		);
	});

	test("a charged date is not missed", () => {
		expect(view({ charges: [...SEPT, paid(ENDED, "2026-10-05")] }).gap).toEqual(
			[],
		);
	});

	test("a skipped date is not missed", () => {
		const skipped = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-09-30",
			skips: ["2026-10-05"],
		});
		expect(view({}, skipped).gap).toEqual([]);
	});

	test("an ending Subscription has no missed charges", () => {
		expect(view({}, ENDING).gap).toEqual([]);
		expect(view({}, ENDING).choices).toBeNull();
	});

	test("the total is at the amount the resume saves", () => {
		expect(view({ newAmountMinor: 79900 }).choices?.never.description).toBe(
			"Also adds the 1 missed charge: 5 Oct, ₹799.00.",
		);
	});
});

describe("with nothing missed (BR-F05-42)", () => {
	test("an ended one restarts from today", () => {
		const yesterday = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-11-01",
			nextDueOn: null,
		});
		const found = view({ charges: [paid(yesterday, "2026-10-05")] }, yesterday);
		expect(found.choices).toBeNull();
		expect(found.plainLine).toBe("Charges restart from today.");
	});

	test("an ending one clears its end date and carries on after it", () => {
		expect(view({}, ENDING).plainLine).toBe(
			"The end date is cleared. Charges carry on after 31 Dec 2026.",
		);
	});
});

describe("the strip (BR-F05-42)", () => {
	test("restarting shows the last charge, the missed date as not added, today, then two charges", () => {
		expect(view().strip).toEqual([
			{ kind: "kept", label: "5 Sept", amount: "₹649.00" },
			{ kind: "kept", label: "5 Oct", note: "not added" },
			{ kind: "today", label: "Today" },
			{ kind: "new", label: "5 Nov", amount: "₹649.00", note: "next" },
			{ kind: "new", label: "5 Dec", amount: "₹649.00" },
			{ kind: "more", label: "" },
		]);
	});

	test("never stopping shows the missed date as added at the amount saved", () => {
		const found = view({ never: true, newAmountMinor: 79900 });
		expect(found.strip).toContainEqual({
			kind: "new",
			label: "5 Oct",
			amount: "₹799.00",
			note: "added",
		});
	});

	test("never stopping with nothing missed changes nothing", () => {
		expect(view({ never: true }, ENDING).strip).toEqual(view({}, ENDING).strip);
	});

	test("the next two charges use the new amount", () => {
		const found = view({ newAmountMinor: 79900 });
		expect(
			found.strip
				.filter((cell) => cell.kind === "new")
				.map((cell) => cell.amount),
		).toEqual(["₹799.00", "₹799.00"]);
	});

	test("shows at most two missed dates", () => {
		const weekly = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-09-30",
			cadence: { unit: "week", every: 1 },
			startDate: "2026-09-04",
		});
		const found = view({ charges: [] }, weekly);
		expect(found.strip.filter((cell) => cell.note === "not added")).toHaveLength(
			2,
		);
	});

	test("with no charge at all it starts at today", () => {
		expect(view({ charges: [], never: false }).strip[0]).toMatchObject({
			kind: "kept",
			note: "not added",
		});
	});

	test("a skipped date is left out of the charges to come", () => {
		const skipped = subscriptionItem("netflix", {
			status: "ended",
			endDate: "2026-11-01",
			nextDueOn: null,
			skips: ["2026-11-05"],
		});
		const found = view({ charges: [] }, skipped);
		expect(
			found.strip
				.filter((cell) => cell.kind === "new")
				.map((cell) => cell.label),
		).toEqual(["5 Dec", "5 Jan 2027"]);
	});
});

describe("the price (BR-F05-42)", () => {
	test("the hint for an ended one says charges from today use it", () => {
		expect(view().priceHint).toBe("Was ₹649.00. Charges from today use it.");
	});

	test("the hint for an ending one says charges after today use it", () => {
		expect(view({}, ENDING).priceHint).toBe(
			"Was ₹649.00. Charges after today use it.",
		);
	});
});

describe("the write (BR-F05-13, BR-F05-32)", () => {
	test("clears the end date and nothing else", () => {
		expect(view().body).toEqual({ changedAt: NOW, endDate: null });
	});

	test("it never stopped asks for the missed charges", () => {
		expect(view({ never: true }).body).toEqual({
			changedAt: NOW,
			endDate: null,
			backfillGap: true,
		});
	});

	test("it never stopped with nothing to add does not ask", () => {
		expect(view({ never: true }, ENDING).body).not.toHaveProperty("backfillGap");
	});

	test("a new price is sent with its currency", () => {
		expect(view({ newAmountMinor: 79900 }).body).toEqual({
			changedAt: NOW,
			endDate: null,
			amountMinor: 79900,
			currency: "INR",
		});
	});

	test("the same price is no change", () => {
		expect(view({ newAmountMinor: 64900 }).body).not.toHaveProperty(
			"amountMinor",
		);
	});

	test("everything together", () => {
		expect(view({ never: true, newAmountMinor: 79900 }).body).toEqual({
			changedAt: NOW,
			endDate: null,
			backfillGap: true,
			amountMinor: 79900,
			currency: "INR",
		});
	});
});

test("the dialog's words (BR-F05-42)", () => {
	expect(RESUME_TEXT.title("Netflix")).toBe("Resume Netflix?");
	expect(RESUME_TEXT.resume("Netflix")).toBe("Resume Netflix");
	expect(RESUME_TEXT.notNow).toBe("Not now");
	expect(RESUME_TEXT.today).toBe("Restart from today");
	expect(RESUME_TEXT.todayDetail).toBe(
		"Charges restart from today. Months while it was cancelled aren't added.",
	);
	expect(RESUME_TEXT.changePrice).toBe("Change the price too");
	expect(RESUME_TEXT.newAmount).toBe("New amount");
});

describe("the strip: what is left out and how far it looks (BR-F05-42)", () => {
	test("a due date that already has a charge is not shown again", () => {
		const found = view({ charges: [paid(ENDING, "2026-11-05")] }, ENDING);
		const labels = found.strip
			.filter((cell) => cell.kind === "new")
			.map((cell) => cell.label);
		expect(labels).toEqual(["5 Dec", "5 Jan 2027"]);
	});

	test("a yearly Subscription still shows its next two charges, a year apart", () => {
		const prime = subscriptionItem("amazonPrime", {
			status: "ended",
			endDate: "2026-10-30",
			nextDueOn: null,
		});
		const labels = view({ charges: [] }, prime)
			.strip.filter((cell) => cell.kind === "new")
			.map((cell) => cell.label);
		expect(labels).toEqual(["12 Oct 2027", "12 Oct 2028"]);
	});

	test("a price typed in the dialog does not change the one the hint calls Was", () => {
		expect(view({ newAmountMinor: 99900 }).priceHint).toBe(
			"Was ₹649.00. Charges from today use it.",
		);
	});
});
