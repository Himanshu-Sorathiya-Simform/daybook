import { describe, expect, test } from "vitest";

import type { SubscriptionEditInput } from "@/lib/subscriptions/schemas";
import {
	type Confirmed,
	confirmedNotice,
	msUntilMidnight,
	undoBody,
} from "../notices";
import type { SubscriptionChanged, SubscriptionItem } from "../types";
import { subscriptionAnswer, subscriptionItem } from "./fixtures";

/** The golden profile at the golden clock: 2 November 2026 in `en-IN`. */
const F = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
} as const;
const AT = "2026-11-02T08:00:00.000Z";

const NETFLIX = subscriptionItem("netflix");

const changed = (
	over: Partial<SubscriptionChanged> = {},
	item: SubscriptionItem = NETFLIX,
): SubscriptionChanged => ({
	...subscriptionAnswer("netflix", { version: item.version + 1, ...over }),
	changeDate: F.today,
	chargesCreated: 0,
	chargesUpdated: 0,
	chargesDeleted: 0,
	months: [],
	...over,
});

const text = (c: Confirmed) => confirmedNotice(c, F).text;

describe("the texts of BR-F05-33", () => {
	// AC-F05-53
	test("Add", () => {
		expect(
			text({
				kind: "add",
				saved: {
					...subscriptionAnswer("netflix", { version: 1 }),
					chargesCreated: 0,
				},
				sent: {} as never,
			}),
		).toBe("Netflix added. Next charge Thu, 5 Nov.");
	});

	test("Add with past charges, singular and plural", () => {
		const add = (count: number): Confirmed => ({
			kind: "add",
			saved: {
				...subscriptionAnswer("netflix", { version: 1 }),
				chargesCreated: count,
			},
			sent: { backfill: true } as never,
		});
		expect(text(add(14))).toBe(
			"Netflix added with 14 past charges. Next charge Thu, 5 Nov.",
		);
		expect(text(add(1))).toBe(
			"Netflix added with 1 past charge. Next charge Thu, 5 Nov.",
		);
	});

	test("Add with the choice but no charge made says nothing of past ones", () => {
		expect(
			text({
				kind: "add",
				saved: {
					...subscriptionAnswer("netflix", { version: 1 }),
					chargesCreated: 0,
				},
				sent: { backfill: true } as never,
			}),
		).toBe("Netflix added. Next charge Thu, 5 Nov.");
	});

	test("Add without the choice leaves the charge of today out of it", () => {
		expect(
			text({
				kind: "add",
				saved: {
					...subscriptionAnswer("netflix", { version: 1 }),
					chargesCreated: 1,
				},
				sent: { backfill: false } as never,
			}),
		).toBe("Netflix added. Next charge Thu, 5 Nov.");
	});

	test("the next charge is left out when there is none", () => {
		expect(
			text({
				kind: "add",
				saved: {
					...subscriptionAnswer("netflix", {
						version: 1,
						nextDueOn: null,
					}),
					chargesCreated: 0,
				},
				sent: {} as never,
			}),
		).toBe("Netflix added.");
	});

	test("a next charge in another year drops its weekday", () => {
		expect(
			text({
				kind: "edit",
				before: NETFLIX,
				saved: changed({ nextDueOn: "2027-01-05" }),
				sent: { changedAt: AT, name: "Netflix" },
			}),
		).toBe("Netflix saved. Next charge 5 Jan 2027.");
	});

	test("Edit names the Subscription as saved", () => {
		expect(
			text({
				kind: "edit",
				before: NETFLIX,
				saved: changed({ name: "Netflix India" }),
				sent: { changedAt: AT, name: "Netflix India" },
			}),
		).toBe("Netflix India saved. Next charge Thu, 5 Nov.");
	});

	test("Cancel with charges deleted", () => {
		const cancel = (count: number): Confirmed => ({
			kind: "cancel",
			before: NETFLIX,
			saved: changed({ endDate: "2026-11-02", chargesDeleted: count }),
			sent: { changedAt: AT, endDate: "2026-11-02" },
		});
		expect(text(cancel(1))).toBe("Netflix cancelled. 1 charge deleted.");
		expect(text(cancel(2))).toBe("Netflix cancelled. 2 charges deleted.");
	});

	test("Cancel that deletes nothing says earlier charges stay", () => {
		expect(
			text({
				kind: "cancel",
				before: NETFLIX,
				saved: changed({ endDate: "2026-11-02" }),
				sent: { changedAt: AT, endDate: "2026-11-02" },
			}),
		).toBe("Netflix cancelled. Earlier charges stay.");
	});

	test("Cancel with an end date still to come says when it ends", () => {
		expect(
			text({
				kind: "cancel",
				before: NETFLIX,
				saved: changed({ endDate: "2026-12-31" }),
				sent: { changedAt: AT, endDate: "2026-12-31" },
			}),
		).toBe("Netflix ends on 31 Dec 2026.");
	});

	test("an end date of today is cancelled, not ending", () => {
		expect(
			text({
				kind: "cancel",
				before: NETFLIX,
				saved: changed({ endDate: F.today }),
				sent: { changedAt: AT, endDate: F.today },
			}),
		).toBe("Netflix cancelled. Earlier charges stay.");
	});

	test("Resume with and without missed charges", () => {
		const resume = (count: number): Confirmed => ({
			kind: "resume",
			before: subscriptionItem("netflix", { endDate: "2026-09-30" }),
			saved: changed({ endDate: null, chargesCreated: count }),
			sent: { changedAt: AT, endDate: null },
		});
		expect(text(resume(1))).toBe(
			"Netflix resumed. 1 missed charge added. Next charge Thu, 5 Nov.",
		);
		expect(text(resume(2))).toBe(
			"Netflix resumed. 2 missed charges added. Next charge Thu, 5 Nov.",
		);
		expect(text(resume(0))).toBe("Netflix resumed. Next charge Thu, 5 Nov.");
	});

	test("Pause says when charges resume, with the year", () => {
		expect(
			text({
				kind: "pause",
				before: NETFLIX,
				saved: changed({
					pause: { from: "2026-11-05", until: "2027-01-05" },
				}),
				sent: {
					changedAt: AT,
					pause: { from: "2026-11-05", until: "2027-01-05" },
				},
			}),
		).toBe("Netflix paused. Charges resume on 5 Jan 2027.");
	});

	test("Resume now", () => {
		expect(
			text({
				kind: "resumeNow",
				before: subscriptionItem("netflix", {
					pause: { from: "2026-10-05", until: "2027-01-05" },
				}),
				saved: changed({ nextDueOn: "2026-12-05" }),
				sent: {
					changedAt: AT,
					pause: { from: "2026-10-05", until: F.today },
				},
			}),
		).toBe("Netflix resumed. Next charge Sat, 5 Dec.");
	});

	test("Skip and Undo skip", () => {
		const base = {
			before: NETFLIX,
			saved: subscriptionAnswer("netflix"),
			dueOn: "2026-11-05",
		};
		expect(text({ kind: "skip", ...base })).toBe(
			"Skipped the 5 Nov Netflix charge.",
		);
		expect(text({ kind: "unskip", ...base })).toBe(
			"The 5 Nov Netflix charge is back.",
		);
	});

	test("a skipped date in another year carries its year", () => {
		expect(
			text({
				kind: "skip",
				before: NETFLIX,
				saved: subscriptionAnswer("netflix"),
				dueOn: "2027-01-05",
			}),
		).toBe("Skipped the 5 Jan 2027 Netflix charge.");
	});

	test("Delete with charges that stay, and with none", () => {
		const base = { kind: "delete", before: NETFLIX } as const;
		expect(
			text({
				...base,
				saved: {
					changeDate: F.today,
					chargesCreated: 0,
					chargesKept: 2,
					chargesDeleted: 0,
					months: [],
				},
			}),
		).toBe("Netflix deleted. Its charges stay in Transactions.");
		expect(
			text({
				...base,
				before: subscriptionItem("netflix", { chargeCount: 0 }),
				saved: {
					changeDate: F.today,
					chargesCreated: 0,
					chargesKept: 0,
					chargesDeleted: 0,
					months: [],
				},
			}),
		).toBe("Netflix deleted.");
	});

	test("a delete that found it gone reads the charges it had", () => {
		expect(text({ kind: "delete", before: NETFLIX, saved: null })).toBe(
			"Netflix deleted. Its charges stay in Transactions.",
		);
		expect(
			text({
				kind: "delete",
				before: subscriptionItem("netflix", { chargeCount: 0 }),
				saved: null,
			}),
		).toBe("Netflix deleted.");
	});
});

describe("where and what Undo is", () => {
	test("a delete has no Undo and never shows in the panel (D-590)", () => {
		const notice = confirmedNotice(
			{ kind: "delete", before: NETFLIX, saved: null },
			F,
		);
		expect(notice.undo).toBeNull();
		expect(notice.inPanel).toBe(false);
		expect(notice.subscriptionId).toBe(NETFLIX.id);
	});

	test("every other notice may show in the panel", () => {
		expect(
			confirmedNotice(
				{
					kind: "skip",
					before: NETFLIX,
					saved: subscriptionAnswer("netflix"),
					dueOn: "2026-11-05",
				},
				F,
			).inPanel,
		).toBe(true);
	});

	// AC-F05-53
	test("Add is undone by a delete with undo create at the version the create returned", () => {
		const notice = confirmedNotice(
			{
				kind: "add",
				saved: {
					...subscriptionAnswer("netflix", { version: 1 }),
					chargesCreated: 2,
				},
				sent: {} as never,
			},
			F,
		);
		expect(notice.undo?.request).toEqual({
			kind: "delete",
			id: NETFLIX.id,
			body: { undo: "create" },
		});
		expect(notice.undo?.version).toBe(1);
		expect(notice.undo?.origin?.name).toBe("Netflix");
	});

	// AC-F05-53
	test("a skip is undone by Undo skip of that date, and Undo skip by the skip again", () => {
		const saved = subscriptionAnswer("netflix", { version: 3 });
		expect(
			confirmedNotice(
				{ kind: "skip", before: NETFLIX, saved, dueOn: "2026-11-05" },
				F,
			).undo,
		).toMatchObject({
			request: {
				kind: "unskip",
				id: NETFLIX.id,
				dueOn: "2026-11-05",
				body: {},
			},
			version: 3,
		});
		expect(
			confirmedNotice(
				{ kind: "unskip", before: NETFLIX, saved, dueOn: "2026-11-05" },
				F,
			).undo,
		).toMatchObject({
			request: { kind: "skip", id: NETFLIX.id, body: { dueOn: "2026-11-05" } },
			version: 3,
		});
	});

	test("a change is undone by a PATCH at the version the write returned", () => {
		const notice = confirmedNotice(
			{
				kind: "edit",
				before: NETFLIX,
				saved: changed({ name: "Netflix India", version: 7 }),
				sent: { changedAt: AT, name: "Netflix India" },
			},
			F,
		);
		expect(notice.undo).toMatchObject({
			request: { kind: "change", id: NETFLIX.id, body: { name: "Netflix" } },
			version: 7,
		});
	});

	test("a change that changed no value has no Undo", () => {
		const notice = confirmedNotice(
			{
				kind: "edit",
				before: NETFLIX,
				saved: changed(),
				sent: { changedAt: AT, name: "Netflix" },
			},
			F,
		);
		expect(notice.undo).toBeNull();
		expect(notice.text).toBe("Netflix saved. Next charge Thu, 5 Nov.");
	});
});

describe("what Undo sends after a change (BR-F05-34)", () => {
	const body = (
		sent: Partial<SubscriptionEditInput>,
		over: {
			before?: SubscriptionItem;
			kind?: Parameters<typeof undoBody>[0]["kind"];
		} = {},
	) =>
		undoBody(
			{
				before: over.before ?? NETFLIX,
				saved: { currency: "INR" },
				sent: { changedAt: AT, ...sent },
				kind: over.kind ?? "edit",
			},
			F.today,
		);

	// AC-F05-53
	test("the previous value of each field the write changed, and no other", () => {
		expect(
			body({
				name: "Netflix India",
				amountMinor: 79900,
				currency: "INR",
				category: "utilities",
				note: "Family plan",
				startDate: "2026-06-05",
				cadence: { unit: "month", every: 3 },
			}),
		).toEqual({
			name: "Netflix",
			amountMinor: NETFLIX.amountMinor,
			currency: "INR",
			category: NETFLIX.category,
			note: NETFLIX.note,
			startDate: NETFLIX.startDate,
			cadence: NETFLIX.cadence,
		});
	});

	test("a field sent with its stored value is not undone", () => {
		expect(
			body({ name: "Netflix", amountMinor: 79900, currency: "INR" }),
		).toEqual({
			amountMinor: NETFLIX.amountMinor,
			currency: "INR",
		});
	});

	test("an equal cadence, even a new object, is no change", () => {
		expect(
			body({
				cadence: { ...NETFLIX.cadence },
				name: "Netflix India",
			}),
		).toEqual({ name: "Netflix" });
	});

	test("nothing changed means nothing to undo", () => {
		expect(body({ name: "Netflix" })).toBeNull();
		expect(body({})).toBeNull();
	});

	test("the currency is the one the write locked", () => {
		expect(
			undoBody(
				{
					before: NETFLIX,
					saved: { currency: "USD" },
					sent: { changedAt: AT, amountMinor: 1, currency: "USD" },
					kind: "edit",
				},
				F.today,
			),
		).toMatchObject({ currency: "USD" });
	});

	// AC-F05-53
	test("a skip the write made is taken back, one that was already there is not", () => {
		const schedule = {
			cadence: { unit: "month", every: 2 } as const,
			skipDueOn: "2026-11-15",
		};
		expect(body(schedule)).toEqual({
			cadence: NETFLIX.cadence,
			unskipDueOn: "2026-11-15",
		});
		expect(
			body(schedule, {
				before: subscriptionItem("netflix", { skips: ["2026-11-15"] }),
			}),
		).toEqual({ cadence: NETFLIX.cadence });
	});

	test("renaming past charges is undone by renaming them back", () => {
		expect(body({ name: "Netflix India", alsoPastCharges: true })).toEqual({
			name: "Netflix",
			alsoPastCharges: true,
		});
		expect(body({ category: "utilities", alsoPastCharges: true })).toEqual({
			category: NETFLIX.category,
			alsoPastCharges: true,
		});
	});

	test("the past-charges option is sent only when a name or category goes back", () => {
		expect(
			body({
				name: "Netflix",
				amountMinor: 79900,
				currency: "INR",
				alsoPastCharges: true,
			}),
		).toEqual({ amountMinor: NETFLIX.amountMinor, currency: "INR" });
	});

	// AC-F05-53
	test("a cancel puts the end date back with backfillGap, for any previous end date", () => {
		expect(body({ endDate: "2026-11-02" }, { kind: "cancel" })).toEqual({
			endDate: null,
			backfillGap: true,
		});
		const ending = subscriptionItem("netflix", { endDate: "2026-12-31" });
		expect(
			body({ endDate: "2026-11-02" }, { kind: "cancel", before: ending }),
		).toEqual({ endDate: "2026-12-31", backfillGap: true });
	});

	test("other writes that move the end date send no backfillGap", () => {
		const ended = subscriptionItem("netflix", { endDate: "2026-09-30" });
		expect(body({ endDate: null }, { kind: "resume", before: ended })).toEqual({
			endDate: "2026-09-30",
		});
		expect(body({ endDate: "2026-12-31" }, { kind: "edit" })).toEqual({
			endDate: null,
		});
	});

	test("a resume puts the old end date and price back", () => {
		const ended = subscriptionItem("netflix", { endDate: "2026-09-30" });
		expect(
			body(
				{
					endDate: null,
					amountMinor: 79900,
					currency: "INR",
					backfillGap: true,
				},
				{ kind: "resume", before: ended },
			),
		).toEqual({
			endDate: "2026-09-30",
			amountMinor: NETFLIX.amountMinor,
			currency: "INR",
		});
	});

	// AC-F05-53
	test("Resume now puts the pause back with its stored start", () => {
		const paused = subscriptionItem("netflix", {
			pause: { from: "2026-10-05", until: "2027-01-05" },
		});
		expect(
			body(
				{ pause: { from: "2026-10-05", until: "2026-11-02" } },
				{ kind: "resumeNow", before: paused },
			),
		).toEqual({ pause: { from: "2026-10-05", until: "2027-01-05" } });
	});

	test("Resume now before the pause started puts the pause back too", () => {
		const coming = subscriptionItem("netflix", {
			pause: { from: "2026-11-05", until: "2027-01-05" },
		});
		expect(body({ pause: null }, { kind: "resumeNow", before: coming })).toEqual(
			{
				pause: { from: "2026-11-05", until: "2027-01-05" },
			},
		);
	});

	test("a new pause is undone by clearing it", () => {
		expect(
			body(
				{ pause: { from: "2026-11-05", until: "2027-01-05" } },
				{ kind: "pause" },
			),
		).toEqual({ pause: null });
	});

	test("a pause over by now is not put back: it cannot be set again, and clearing keeps its dates unpaid", () => {
		const over = subscriptionItem("netflix", {
			pause: { from: "2026-08-05", until: "2026-10-05" },
		});
		expect(
			body(
				{ pause: { from: "2026-11-05", until: "2027-01-05" } },
				{ kind: "pause", before: over },
			),
		).toEqual({ pause: null });
	});

	test("a pause that ends today is over", () => {
		const endsToday = subscriptionItem("netflix", {
			pause: { from: "2026-10-05", until: F.today },
		});
		expect(
			body(
				{ pause: { from: "2026-11-05", until: "2027-01-05" } },
				{ kind: "pause", before: endsToday },
			),
		).toEqual({ pause: null });
	});

	test("a changed pause goes back to the earlier one that is still to come", () => {
		const paused = subscriptionItem("netflix", {
			pause: { from: "2026-10-05", until: "2027-01-05" },
		});
		expect(
			body(
				{ pause: { from: "2026-10-05", until: "2027-03-05" } },
				{ kind: "pause", before: paused },
			),
		).toEqual({ pause: { from: "2026-10-05", until: "2027-01-05" } });
	});

	test("a pause sent with the stored one is no change", () => {
		const paused = subscriptionItem("netflix", {
			pause: { from: "2026-10-05", until: "2027-01-05" },
		});
		expect(
			body(
				{ pause: { from: "2026-10-05", until: "2027-01-05" } },
				{ kind: "pause", before: paused },
			),
		).toBeNull();
	});
});

describe("when the notice ends (BR-F05-33)", () => {
	test("at the next midnight in the profile's zone", () => {
		// 8:00 UTC is 13:30 in Kolkata, so 10.5 hours remain.
		expect(
			msUntilMidnight(new Date("2026-11-02T08:00:00Z"), "Asia/Kolkata"),
		).toBe(10.5 * 3_600_000);
	});

	test("the zone decides which day it is", () => {
		// 20:00 UTC on 2 November is already 3 November, 01:30, in Kolkata.
		expect(
			msUntilMidnight(new Date("2026-11-02T20:00:00Z"), "Asia/Kolkata"),
		).toBe(22.5 * 3_600_000);
		expect(msUntilMidnight(new Date("2026-11-02T20:00:00Z"), "UTC")).toBe(
			4 * 3_600_000,
		);
	});

	test("one second before midnight leaves one second", () => {
		expect(
			msUntilMidnight(new Date("2026-11-02T18:29:59Z"), "Asia/Kolkata"),
		).toBe(1000);
	});

	test("exactly at midnight a whole day remains", () => {
		expect(
			msUntilMidnight(new Date("2026-11-02T18:30:00Z"), "Asia/Kolkata"),
		).toBe(24 * 3_600_000);
	});

	test("a day with a clock change is 23 or 25 hours long", () => {
		// New York leaves summer time at 2:00 on 1 November 2026.
		expect(
			msUntilMidnight(new Date("2026-11-01T04:00:00Z"), "America/New_York"),
		).toBe(25 * 3_600_000);
	});
});
