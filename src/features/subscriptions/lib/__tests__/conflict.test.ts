import { describe, expect, test } from "vitest";

import { applyRequest, CONFLICT_TEXT, conflictRows, fieldsOf } from "../conflict";
import { subscriptionItem } from "./fixtures";

const F = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
} as const;
const NETFLIX = subscriptionItem("netflix");
const BASE = fieldsOf(NETFLIX);
const AT = "2026-11-02T08:00:00.000Z";

describe("fieldsOf", () => {
	test("takes the values a conflict compares, with a copy of the skips", () => {
		const item = subscriptionItem("cultGym");
		const fields = fieldsOf(item);
		expect(fields).toEqual({
			name: item.name,
			amountMinor: item.amountMinor,
			cadence: item.cadence,
			category: item.category,
			startDate: item.startDate,
			endDate: item.endDate,
			pause: item.pause,
			note: item.note,
			skips: ["2026-10-10"],
		});
		fields.skips.push("x");
		expect(item.skips).toEqual(["2026-10-10"]);
	});
});

describe("applyRequest: the Subscription as a write would leave it", () => {
	test("a change puts its fields over the saved ones and keeps the rest", () => {
		const next = applyRequest(BASE, {
			kind: "change",
			id: NETFLIX.id,
			body: {
				changedAt: AT,
				name: "Netflix India",
				amountMinor: 79900,
				currency: "INR",
				cadence: { unit: "month", every: 3 },
				category: "utilities",
				startDate: "2026-06-05",
				endDate: "2026-12-31",
				pause: { from: "2026-11-05", until: "2027-01-05" },
				note: "Family",
			},
		});
		expect(next).toEqual({
			name: "Netflix India",
			amountMinor: 79900,
			cadence: { unit: "month", every: 3 },
			category: "utilities",
			startDate: "2026-06-05",
			endDate: "2026-12-31",
			pause: { from: "2026-11-05", until: "2027-01-05" },
			note: "Family",
			skips: [],
		});
	});

	test("a field left out stays as saved, and null clears an end date, a pause and a note", () => {
		const saved = {
			...BASE,
			endDate: "2026-12-31",
			pause: { from: "2026-11-05", until: "2027-01-05" },
			note: "x",
		};
		expect(
			applyRequest(saved, {
				kind: "change",
				id: "x",
				body: { endDate: null, pause: null, note: null },
			}),
		).toMatchObject({ endDate: null, pause: null, note: null, name: "Netflix" });
		expect(
			applyRequest(saved, { kind: "change", id: "x", body: { name: "A" } }),
		).toMatchObject({ endDate: "2026-12-31", note: "x" });
	});

	test("skipDueOn adds a date once, in order, and unskipDueOn takes one away", () => {
		const skipped = { ...BASE, skips: ["2026-12-05"] };
		expect(
			applyRequest(skipped, {
				kind: "change",
				id: "x",
				body: { skipDueOn: "2026-11-15" },
			}).skips,
		).toEqual(["2026-11-15", "2026-12-05"]);
		expect(
			applyRequest(skipped, {
				kind: "change",
				id: "x",
				body: { skipDueOn: "2026-12-05" },
			}).skips,
		).toEqual(["2026-12-05"]);
		expect(
			applyRequest(skipped, {
				kind: "change",
				id: "x",
				body: { unskipDueOn: "2026-12-05" },
			}).skips,
		).toEqual([]);
	});

	test("a skip adds its date and an Undo skip takes it away", () => {
		expect(
			applyRequest(BASE, {
				kind: "skip",
				id: "x",
				body: { dueOn: "2026-11-05" },
			}).skips,
		).toEqual(["2026-11-05"]);
		expect(
			applyRequest(
				{ ...BASE, skips: ["2026-11-05"] },
				{ kind: "skip", id: "x", body: { dueOn: "2026-11-05" } },
			).skips,
		).toEqual(["2026-11-05"]);
		expect(
			applyRequest(
				{ ...BASE, skips: ["2026-11-05", "2026-12-05"] },
				{ kind: "unskip", id: "x", dueOn: "2026-11-05", body: {} },
			).skips,
		).toEqual(["2026-12-05"]);
	});

	test("a delete leaves it as it is", () => {
		expect(applyRequest(BASE, { kind: "delete", id: "x", body: {} })).toEqual(
			BASE,
		);
	});

	test("it never changes what it is given", () => {
		const copy = structuredClone(BASE);
		applyRequest(BASE, {
			kind: "change",
			id: "x",
			body: { name: "A", skipDueOn: "2026-11-15" },
		});
		expect(BASE).toEqual(copy);
	});
});

describe("conflictRows (BR-F05-34)", () => {
	const rows = (mine: Parameters<typeof conflictRows>[0], theirs = BASE) =>
		conflictRows(mine, theirs, F);

	// AC-F05-54
	test("a row for each value, in the dialog's order, skipped dates last", () => {
		expect(rows(BASE).map((row) => row.label)).toEqual([
			"Name",
			"Amount",
			"How often",
			"Category",
			"Started on",
			"Ends",
			"Pause",
			"Note",
			"Skipped",
		]);
	});

	test("two equal versions differ nowhere", () => {
		expect(rows(BASE).some((row) => row.differs)).toBe(false);
	});

	// AC-F05-54
	test("each value is worded as the page words it", () => {
		const saved = {
			...BASE,
			endDate: "2026-12-31",
			pause: { from: "2026-11-05", until: "2027-01-05" },
			note: "Family plan",
			skips: ["2026-11-05", "2027-01-05"],
		};
		const read = Object.fromEntries(
			rows(saved, saved).map((row) => [row.key, row.theirs]),
		);
		expect(read).toEqual({
			name: "Netflix",
			amount: "₹649.00",
			cadence: "Monthly",
			category: "Entertainment",
			startDate: "5 Sept",
			endDate: "31 Dec",
			pause: "5 Nov until 5 Jan 2027",
			note: "Family plan",
			skips: "5 Nov, 5 Jan 2027",
		});
	});

	test("none is written None, for an end date, a pause, a note and skipped dates", () => {
		const none = Object.fromEntries(
			rows({ ...BASE, note: "" }).map((row) => [row.key, row.mine]),
		);
		expect(none).toMatchObject({
			endDate: CONFLICT_TEXT.none,
			pause: CONFLICT_TEXT.none,
			note: CONFLICT_TEXT.none,
			skips: CONFLICT_TEXT.none,
		});
		expect(rows({ ...BASE, note: null })[7]?.mine).toBe("None");
	});

	// AC-F05-54
	test("a row that reads differently is marked, and only that row", () => {
		const mine = { ...BASE, name: "Netflix India", amountMinor: 79900 };
		const marked = rows(mine)
			.filter((row) => row.differs)
			.map((row) => row.key);
		expect(marked).toEqual(["name", "amount"]);
		const row = rows(mine)[1];
		expect(row).toMatchObject({ mine: "₹799.00", theirs: "₹649.00" });
	});

	test("a cadence that is the same under another name does not differ", () => {
		expect(
			rows({ ...BASE, cadence: { unit: "month", every: 1 } }).some(
				(row) => row.differs,
			),
		).toBe(false);
		expect(
			rows({ ...BASE, cadence: { unit: "month", every: 3 } })[2],
		).toMatchObject({
			mine: "Every 3 months",
			theirs: "Monthly",
			differs: true,
		});
	});

	test("dates in another year carry the year", () => {
		expect(rows({ ...BASE, startDate: "2025-08-05" })[4]?.mine).toBe(
			"5 Aug 2025",
		);
	});

	test("a note's own text is shown whole", () => {
		const long = "n".repeat(300);
		expect(rows({ ...BASE, note: long })[7]?.mine).toBe(long);
	});
});

describe("the words", () => {
	test("the view is titled as the spec says", () => {
		expect(CONFLICT_TEXT.title).toBe(
			"This Subscription changed on another device",
		);
	});

	test("a delete reads Delete anyway and Keep it", () => {
		expect(CONFLICT_TEXT.deleteAnyway).toBe("Delete anyway");
		expect(CONFLICT_TEXT.keepIt).toBe("Keep it");
		expect(CONFLICT_TEXT.keepMine).toBe("Keep mine");
		expect(CONFLICT_TEXT.keepTheirs).toBe("Keep theirs");
	});
});
