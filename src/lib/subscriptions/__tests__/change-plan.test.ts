import { describe, expect, test } from "vitest";

import {
	type ChangeCheck,
	changedFields,
	changeIssues,
	doomedCharges,
	type LaterCharge,
	planChange,
} from "../change-plan";
import { SUBSCRIPTION_MESSAGES as M } from "../messages";
import type { DatedSubscription } from "../model";
import type { SubscriptionEditBody } from "../schemas";
import { type GoldenName, goldenSubscription, GOLDEN_TODAY } from "./golden";

/** The golden clock's date is the change date C: every test changes on 2 November. */
const C = GOLDEN_TODAY;

const dated = (
	name: GoldenName = "netflix",
	changes: Partial<DatedSubscription> = {},
): DatedSubscription => ({
	...goldenSubscription(name),
	note: null,
	demo: false,
	...changes,
});

const body = (changes: Partial<SubscriptionEditBody>): SubscriptionEditBody =>
	({ changedAt: "2026-11-02T06:30:00.000Z", ...changes }) as SubscriptionEditBody;

const check = (
	edit: SubscriptionEditBody,
	stored: DatedSubscription = dated(),
	later: readonly LaterCharge[] = [],
): ChangeCheck => ({
	body: edit,
	stored,
	plan: planChange(edit, stored, C),
	changeDate: C,
	today: GOLDEN_TODAY,
	later,
});

describe("changedFields (BR-F05-08)", () => {
	test("a body with only changedAt changes nothing", () => {
		expect(Object.values(changedFields(body({}), dated()))).toEqual(
			Array(8).fill(false),
		);
	});

	test("a field sent with its stored value is no change", () => {
		const netflix = dated("netflix", {
			pause: { from: "2026-12-05", until: "2027-01-05" },
		});
		expect(
			Object.values(
				changedFields(
					body({
						name: "Netflix",
						amountMinor: 64900,
						category: "entertainment",
						note: null,
						cadence: { unit: "month", every: 1 },
						startDate: "2026-09-05",
						endDate: null,
						pause: { from: "2026-12-05", until: "2027-01-05" },
					}),
					netflix,
				),
			),
		).toEqual(Array(8).fill(false));
	});

	test.each([
		["name", { name: "Netflix HD" }],
		["amount", { amountMinor: 79900 }],
		["category", { category: "shopping" }],
		["note", { note: "Family plan" }],
		["cadence", { cadence: { unit: "month", every: 2 } }],
		["cadence", { cadence: { unit: "week", every: 1 } }],
		["start", { startDate: "2026-09-06" }],
		["end", { endDate: "2026-12-31" }],
		["pause", { pause: { from: "2026-11-05", until: "2026-12-05" } }],
	] as const)("%s alone is the only field that changes", (field, edit) => {
		const changed = changedFields(body(edit as never), dated());
		expect(changed[field]).toBe(true);
		expect(Object.values(changed).filter(Boolean)).toHaveLength(1);
	});

	test("a pause that moves only its end is a change", () => {
		const netflix = dated("netflix", {
			pause: { from: "2026-11-05", until: "2026-12-05" },
		});
		expect(
			changedFields(
				body({ pause: { from: "2026-11-05", until: "2027-01-05" } }),
				netflix,
			).pause,
		).toBe(true);
	});

	test("clearing a pause, or the end date, is a change", () => {
		const netflix = dated("netflix", {
			endDate: "2026-12-31",
			pause: { from: "2026-11-05", until: "2026-12-05" },
		});
		const changed = changedFields(body({ endDate: null, pause: null }), netflix);
		expect(changed.end).toBe(true);
		expect(changed.pause).toBe(true);
	});

	test("a note cleared with null is a change when there was one", () => {
		expect(
			changedFields(body({ note: null }), dated("netflix", { note: "Family" }))
				.note,
		).toBe(true);
	});
});

describe("planChange (BR-F05-08 to BR-F05-14, BR-F05-29 to BR-F05-32)", () => {
	test("a value change reprices, and prunes nothing", () => {
		const plan = planChange(body({ name: "Netflix HD" }), dated(), C);
		expect(plan).toMatchObject({
			valuesChanged: true,
			scheduleChanged: false,
			isChange: true,
			noteOnly: false,
			prune: false,
			needsCharges: false,
			endCut: null,
			laterFrom: C,
			skipAdded: null,
			skipRemoved: null,
			skippedAfter: [],
		});
		expect(plan.next).toEqual({ ...dated(), name: "Netflix HD" });
		expect(plan.gone.size).toBe(0);
	});

	test("an amount or a category counts as a value change too", () => {
		expect(
			planChange(body({ amountMinor: 79900 }), dated(), C).valuesChanged,
		).toBe(true);
		expect(
			planChange(body({ category: "shopping" }), dated(), C).valuesChanged,
		).toBe(true);
	});

	// BR-F05-09
	test("a note alone only saves the note", () => {
		const plan = planChange(body({ note: "Family plan" }), dated(), C);
		expect(plan).toMatchObject({
			isChange: true,
			noteOnly: true,
			valuesChanged: false,
			needsCharges: false,
		});
		expect(plan.next.note).toBe("Family plan");
	});

	test("a note with anything else is not note-only", () => {
		expect(
			planChange(body({ note: "x", name: "Netflix HD" }), dated(), C).noteOnly,
		).toBe(false);
		expect(
			planChange(body({ note: "x", skipDueOn: "2026-11-05" }), dated(), C)
				.noteOnly,
		).toBe(false);
	});

	test("a write that changes nothing is no change", () => {
		const plan = planChange(body({ name: "Netflix" }), dated(), C);
		expect(plan).toMatchObject({ isChange: false, noteOnly: false });
	});

	// BR-F05-11
	test("a schedule change moves chargesFrom to the day after C and prunes", () => {
		const plan = planChange(
			body({ cadence: { unit: "month", every: 2 } }),
			dated(),
			C,
		);
		expect(plan).toMatchObject({
			scheduleChanged: true,
			prune: true,
			needsCharges: true,
			laterFrom: C,
		});
		expect(plan.next.chargesFrom).toBe("2026-11-03");
		expect(plan.next.cadence).toEqual({ unit: "month", every: 2 });
	});

	test("a start date after C is the new chargesFrom", () => {
		const plan = planChange(body({ startDate: "2026-12-01" }), dated(), C);
		expect(plan.next.chargesFrom).toBe("2026-12-01");
		expect(plan.next.startDate).toBe("2026-12-01");
	});

	// BR-F05-11, D-596
	test("a schedule change deletes the tombstones it takes off the schedule, after C", () => {
		const netflix = dated("netflix", {
			skipped: ["2026-10-05", "2026-12-05", "2027-01-05"],
		});
		const plan = planChange(
			body({ cadence: { unit: "month", every: 2 } }),
			netflix,
			C,
		);
		expect([...plan.gone]).toEqual(["2026-12-05"]);
		expect(plan.skippedAfter).toEqual(["2026-10-05", "2027-01-05"]);
	});

	// BR-F05-12
	test("an end date set earlier cuts at it, even before C", () => {
		const plan = planChange(body({ endDate: "2026-10-20" }), dated(), C);
		expect(plan).toMatchObject({
			endCut: "2026-10-20",
			prune: true,
			needsCharges: true,
			laterFrom: "2026-10-20",
		});
		expect(plan.next.endDate).toBe("2026-10-20");
	});

	test("an end date after C cuts at it, reading from C", () => {
		const plan = planChange(body({ endDate: "2026-12-31" }), dated(), C);
		expect(plan).toMatchObject({ endCut: "2026-12-31", laterFrom: C });
	});

	test("an end date moved later, or cleared, cuts nothing", () => {
		const ending = dated("netflix", { endDate: "2026-12-31" });
		expect(planChange(body({ endDate: "2027-03-31" }), ending, C)).toMatchObject(
			{
				endCut: null,
				prune: false,
				needsCharges: false,
			},
		);
		expect(planChange(body({ endDate: null }), ending, C)).toMatchObject({
			endCut: null,
			prune: false,
		});
	});

	// BR-F05-13, BR-F05-32
	test("a resume charges from C, or from the earlier chargesFrom with backfillGap", () => {
		const ended = dated("netflix", { endDate: "2026-09-30" });
		const resumed = planChange(body({ endDate: null }), ended, C);
		expect(resumed.next.chargesFrom).toBe("2026-11-02");
		const backfilled = planChange(
			body({ endDate: null, backfillGap: true }),
			ended,
			C,
		);
		expect(backfilled.next.chargesFrom).toBe("2026-09-05");
	});

	// BR-F05-29
	test("a new pause prunes, and leaves chargesFrom", () => {
		const plan = planChange(
			body({ pause: { from: "2026-11-05", until: "2026-12-05" } }),
			dated(),
			C,
		);
		expect(plan).toMatchObject({
			prune: true,
			needsCharges: true,
			chargesFromBeforePause: "2026-09-05",
		});
		expect(plan.next.pause).toEqual({ from: "2026-11-05", until: "2026-12-05" });
		expect(plan.next.chargesFrom).toBe("2026-09-05");
	});

	test("clearing a pause that started moves chargesFrom to C, after the pause check's value", () => {
		const paused = dated("netflix", {
			pause: { from: "2026-10-05", until: "2026-12-05" },
		});
		const plan = planChange(body({ pause: null }), paused, C);
		expect(plan.chargesFromBeforePause).toBe("2026-09-05");
		expect(plan.next.chargesFrom).toBe(C);
		expect(plan.next.pause).toBeNull();
	});

	// BR-F05-31
	test("skipDueOn adds the tombstone and reads the charges", () => {
		const plan = planChange(body({ skipDueOn: "2026-11-05" }), dated(), C);
		expect(plan).toMatchObject({
			skipAdded: "2026-11-05",
			skipRemoved: null,
			isChange: true,
			noteOnly: false,
			needsCharges: true,
			prune: false,
			skippedAfter: ["2026-11-05"],
		});
		expect(plan.gone.size).toBe(0);
	});

	test("skipDueOn on a date already skipped adds nothing and changes nothing", () => {
		const netflix = dated("netflix", { skipped: ["2026-11-05"] });
		const plan = planChange(body({ skipDueOn: "2026-11-05" }), netflix, C);
		expect(plan).toMatchObject({
			skipAdded: null,
			isChange: false,
			skippedAfter: ["2026-11-05"],
		});
	});

	// BR-F05-34, D-612
	test("unskipDueOn removes its tombstone", () => {
		const netflix = dated("netflix", { skipped: ["2026-11-05", "2026-12-05"] });
		const plan = planChange(body({ unskipDueOn: "2026-11-05" }), netflix, C);
		expect(plan).toMatchObject({
			skipRemoved: "2026-11-05",
			isChange: true,
			skippedAfter: ["2026-12-05"],
		});
		expect([...plan.gone]).toEqual(["2026-11-05"]);
	});

	test("unskipDueOn on a date with no tombstone changes nothing", () => {
		const plan = planChange(body({ unskipDueOn: "2026-11-05" }), dated(), C);
		expect(plan).toMatchObject({ skipRemoved: null, isChange: false });
		expect(plan.gone.size).toBe(0);
	});

	test("never changes the stored Subscription", () => {
		const stored = dated("cultGym", { skipped: ["2026-10-10", "2026-12-10"] });
		const before = structuredClone(stored);
		planChange(
			body({
				name: "Cult Gym Pro",
				cadence: { unit: "month", every: 2 },
				endDate: "2027-03-31",
				pause: { from: "2026-11-10", until: "2026-12-10" },
				unskipDueOn: "2026-12-10",
			}),
			stored,
			C,
		);
		expect(stored).toEqual(before);
	});
});

describe("changeIssues (BR-F05-29 to BR-F05-34)", () => {
	const paths = (input: ChangeCheck) =>
		changeIssues(input).map((issue) => issue.path.join("."));

	test("an ordinary change has none", () => {
		expect(changeIssues(check(body({ name: "Netflix HD" })))).toEqual([]);
		expect(changeIssues(check(body({ amountMinor: 79900 })))).toEqual([]);
	});

	test("an end date before the start date, judged on the merged row", () => {
		expect(changeIssues(check(body({ endDate: "2026-08-01" })))).toEqual([
			{ path: ["endDate"], message: M.endBeforeStart },
		]);
		expect(
			changeIssues(
				check(
					body({ startDate: "2026-12-01" }),
					dated("netflix", { endDate: "2026-11-30" }),
				),
			),
		).toEqual([{ path: ["endDate"], message: M.endBeforeStart }]);
	});

	test("a start date outside its window, and an end date past 10 years", () => {
		expect(paths(check(body({ startDate: "2010-01-01" })))).toEqual([
			"startDate",
		]);
		expect(paths(check(body({ startDate: "2028-01-01" })))).toEqual([
			"startDate",
		]);
		expect(paths(check(body({ endDate: "2037-01-01" })))).toEqual(["endDate"]);
	});

	test("a field sent with its stored value is not judged", () => {
		const old = dated("netflix", { startDate: "2010-01-01" });
		expect(
			changeIssues(check(body({ startDate: "2010-01-01", name: "N" }), old)),
		).toEqual([]);
	});

	// BR-F05-29
	test("a pause starts on the first pausable date after C", () => {
		const valid = body({ pause: { from: "2026-11-05", until: "2026-12-20" } });
		expect(changeIssues(check(valid))).toEqual([]);
		const wrong = body({ pause: { from: "2026-11-06", until: "2026-12-20" } });
		expect(changeIssues(check(wrong))).toEqual([
			{ path: ["pause", "from"], message: M.pauseFrom },
		]);
	});

	test("a pause is judged over the stored pause and chargesFrom, not the new ones", () => {
		const stored = dated("netflix", {
			pause: { from: "2026-10-05", until: "2026-11-20" },
		});
		// In force at C, same start: only its end may move.
		expect(
			changeIssues(
				check(
					body({ pause: { from: "2026-10-05", until: "2026-12-20" } }),
					stored,
				),
			),
		).toEqual([]);
	});

	test("clearing a pause is not judged", () => {
		const stored = dated("netflix", {
			pause: { from: "2026-10-05", until: "2026-11-20" },
		});
		expect(changeIssues(check(body({ pause: null }), stored))).toEqual([]);
	});

	// BR-F05-31
	test("skipDueOn must be a due date after C", () => {
		expect(changeIssues(check(body({ skipDueOn: "2026-11-05" })))).toEqual([]);
		expect(changeIssues(check(body({ skipDueOn: "2026-11-06" })))).toEqual([
			{ path: ["skipDueOn"], message: M.doubleChargeSkip },
		]);
		expect(changeIssues(check(body({ skipDueOn: "2026-10-05" })))).toEqual([
			{ path: ["skipDueOn"], message: M.doubleChargeSkip },
		]);
	});

	test("skipDueOn over an edited charge is refused, over an unedited one is not", () => {
		const edited: LaterCharge = { id: "e", dueOn: "2026-11-05", edited: true };
		expect(
			changeIssues(
				check(body({ skipDueOn: "2026-11-05" }), dated(), [edited]),
			),
		).toEqual([{ path: ["skipDueOn"], message: M.skipEdited }]);
		expect(
			changeIssues(
				check(body({ skipDueOn: "2026-11-05" }), dated(), [
					{ ...edited, edited: false },
				]),
			),
		).toEqual([]);
		expect(
			changeIssues(
				check(body({ skipDueOn: "2026-11-05" }), dated(), [
					{ id: "o", dueOn: "2026-12-05", edited: true },
				]),
			),
		).toEqual([]);
	});

	// BR-F05-34, D-612
	test("unskipDueOn needs a date after C, but only when it has a tombstone", () => {
		const future = dated("netflix", { skipped: ["2026-12-05"] });
		expect(
			changeIssues(check(body({ unskipDueOn: "2026-12-05" }), future)),
		).toEqual([]);
		const passed = dated("netflix", { skipped: ["2026-10-05"] });
		expect(
			changeIssues(check(body({ unskipDueOn: "2026-10-05" }), passed)),
		).toEqual([{ path: ["unskipDueOn"], message: M.unskipPassed }]);
		expect(changeIssues(check(body({ unskipDueOn: "2026-10-05" })))).toEqual([]);
	});

	test("every refusal at once, windows first, then skip and unskip", () => {
		const stored = dated("netflix", { skipped: ["2026-10-05"] });
		expect(
			paths(
				check(
					body({
						endDate: "2026-08-01",
						skipDueOn: "2026-11-06",
						unskipDueOn: "2026-10-05",
					}),
					stored,
				),
			),
		).toEqual(["endDate", "skipDueOn", "unskipDueOn"]);
	});
});

describe("doomedCharges (BR-F05-11, BR-F05-12, BR-F05-29, BR-F05-31)", () => {
	const LATER: LaterCharge[] = [
		{ id: "a", dueOn: "2026-11-05", edited: false },
		{ id: "b", dueOn: "2026-12-05", edited: true },
		{ id: "c", dueOn: "2027-01-05", edited: false },
	];
	const doomed = (
		edit: SubscriptionEditBody,
		later: readonly LaterCharge[] = LATER,
		stored: DatedSubscription = dated(),
	) => doomedCharges(later, check(edit, stored, later));

	test("a value change deletes nothing", () => {
		expect(doomed(body({ name: "Netflix HD" }))).toEqual([]);
	});

	test("the unedited charge on a skipped date goes, the edited one stays", () => {
		expect(doomed(body({ skipDueOn: "2026-11-05" }))).toEqual(["a"]);
		expect(doomed(body({ skipDueOn: "2026-12-05" }))).toEqual([]);
	});

	test("an end date deletes the unedited charges after it", () => {
		expect(doomed(body({ endDate: "2026-12-01" }))).toEqual(["c"]);
		expect(doomed(body({ endDate: "2026-11-30" }))).toEqual(["c"]);
	});

	test("an end date before C deletes the charges after it, even those before C", () => {
		const earlier: LaterCharge[] = [
			{ id: "x", dueOn: "2026-10-25", edited: false },
			{ id: "y", dueOn: "2026-11-05", edited: false },
		];
		expect(doomed(body({ endDate: "2026-10-20" }), earlier)).toEqual(["x", "y"]);
	});

	test("a schedule change deletes the charges after C that are off the new schedule", () => {
		// Every 2 months from 5 September: 5 November, 5 January.
		expect(doomed(body({ cadence: { unit: "month", every: 2 } }))).toEqual([]);
		const offSchedule: LaterCharge[] = [
			...LATER,
			{ id: "d", dueOn: "2026-12-20", edited: false },
		];
		expect(
			doomed(body({ cadence: { unit: "month", every: 2 } }), offSchedule),
		).toEqual(["d"]);
	});

	test("a schedule change leaves a charge on C, which keeps the old schedule", () => {
		expect(
			doomed(body({ cadence: { unit: "month", every: 2 } }), [
				{ id: "k", dueOn: C, edited: false },
			]),
		).toEqual([]);
	});

	test("a new start date deletes the charges before it", () => {
		// Monthly on the 5th from 5 December: 5 January stays.
		expect(doomed(body({ startDate: "2026-12-05" }))).toEqual(["a"]);
	});

	test("a new pause deletes the charges inside it", () => {
		expect(
			doomed(body({ pause: { from: "2026-11-05", until: "2026-12-05" } })),
		).toEqual(["a"]);
	});

	test("an extended pause deletes a charge on C inside it", () => {
		const stored = dated("netflix", {
			pause: { from: "2026-10-05", until: C },
		});
		const later: LaterCharge[] = [{ id: "k", dueOn: C, edited: false }];
		expect(
			doomed(
				body({ pause: { from: "2026-10-05", until: "2026-12-05" } }),
				later,
				stored,
			),
		).toEqual(["k"]);
	});

	test("an edited charge always stays", () => {
		const edited: LaterCharge[] = [
			{ id: "e1", dueOn: "2026-12-30", edited: true },
			{ id: "e2", dueOn: "2027-02-01", edited: true },
		];
		expect(
			doomed(
				body({
					endDate: "2026-11-30",
					cadence: { unit: "month", every: 3 },
				}),
				edited,
			),
		).toEqual([]);
	});

	test("keeps the order of the charges it is given", () => {
		const many: LaterCharge[] = [
			{ id: "3", dueOn: "2027-03-05", edited: false },
			{ id: "1", dueOn: "2027-01-05", edited: false },
			{ id: "2", dueOn: "2027-02-05", edited: false },
		];
		expect(doomed(body({ endDate: "2026-12-01" }), many)).toEqual([
			"3",
			"1",
			"2",
		]);
	});
});
