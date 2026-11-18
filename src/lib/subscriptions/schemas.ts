import { z } from "zod";

import { isMonth, type Month, monthsFrom, shiftMonth } from "@/lib/budgets/months";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { CURRENCY_EXPONENTS, maxMinor, type CurrencyCode } from "@/lib/currency";
import { isUuidV7, uuidV7Time } from "@/lib/ids";
import { optionalTextSchema, textSchema } from "@/lib/text";
import { isIsoDate, monthsBefore, shiftMonths } from "@/lib/time";
import { isInstant, largestAmountMessage } from "@/lib/transactions/schemas";

import {
	endDateLimitMessage,
	monthsWindowMessage,
	startDateRangeMessage,
	SUBSCRIPTION_MESSAGES as M,
} from "./messages";
import { recordingDateOf, type FieldIssue } from "./rules";
import { CADENCE_UNITS, isCadence, type Cadence } from "./schedule";

/** The request bodies of F05 section 11, and the windows that need the request clock. A body
 * schema checks shape, text, amounts and the rules that need no stored row. The windows, the
 * merged row's checks and everything that reads the Subscription stay with the server, which
 * calls the helpers below with the request's clock (BR-P2-43). */

const CURRENCIES = Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[];

const id = z
	.string({ error: M.id })
	.refine(isUuidV7, { error: M.id })
	.transform((value) => value.toLowerCase());
const instant = z
	.string({ error: M.instant })
	.refine(isInstant, { error: M.instant });
const date = z.string({ error: M.date }).refine(isIsoDate, { error: M.date });
const name = textSchema({
	max: 60,
	messages: { required: M.nameRequired, tooLong: M.nameTooLong },
});
const note = optionalTextSchema({ max: 500, multiline: true });
const amountMinor = z
	.number({ error: M.amountWhole })
	.int({ error: M.amountWhole })
	.min(1, { error: M.amountZero });
const currency = z.enum(CURRENCIES, { error: M.currency });
const category = z.enum(EXPENSE_CATEGORIES, { error: M.categoryRequired });
const flag = z.boolean({ error: M.boolean });

/** `{ unit, every }`: a known unit and a whole `every` from 1 to 52 weeks or 24 months (D-90).
 * `every` is judged with the unit, so each unit gets its own message. */
const cadence = z
	.strictObject(
		{
			unit: z.enum(CADENCE_UNITS, { error: M.cadenceRequired }),
			every: z.unknown().optional(),
		},
		{ error: M.cadenceRequired },
	)
	.superRefine((value, ctx) => {
		if (value.unit !== "week" && value.unit !== "month") return;
		if (!isCadence(value)) {
			ctx.addIssue({
				code: "custom",
				message: value.unit === "week" ? M.everyWeeks : M.everyMonths,
				path: ["every"],
			});
		}
	})
	.transform((value) => value as Cadence);

const pause = z.strictObject({ from: date, until: date });

const setByDaybook = z.never({ error: M.systemField }).optional();
const notOnCreate = z.never({ error: M.notOnCreate }).optional();

/** Fields only Daybook sets or derives, refused by name rather than as unknown keys. */
const SYSTEM_FIELDS = {
	chargesFrom: setByDaybook,
	lastChangeOn: setByDaybook,
	demo: setByDaybook,
	version: setByDaybook,
	updatedAt: setByDaybook,
	skips: setByDaybook,
	status: setByDaybook,
	nextDueOn: setByDaybook,
	yearlyMinor: setByDaybook,
	monthlyMinor: setByDaybook,
	chargeCount: setByDaybook,
	paidMinor: setByDaybook,
};

function addIssue(ctx: z.RefinementCtx, path: string | null, message: string) {
	ctx.addIssue({ code: "custom", message, path: path === null ? [] : [path] });
}

/** The amount against the currency's largest (MON-5). Reads only fields that passed. */
function checkAmount(
	body: { amountMinor?: number | undefined; currency?: CurrencyCode | undefined },
	ctx: z.RefinementCtx,
) {
	const { amountMinor: amount, currency: code } = body;
	if (Number.isSafeInteger(amount) && CURRENCIES.includes(code as CurrencyCode)) {
		if ((amount as number) > maxMinor(code as CurrencyCode)) {
			addIssue(ctx, "amountMinor", largestAmountMessage(code as CurrencyCode));
		}
	}
}

/**
 * `POST /api/subscriptions` (F05 section 11): `{ id, name, amountMinor, currency, cadence,
 * startDate, category, note, backfill, createdAt }`. `backfill` is the past-charges choice and
 * defaults to the default choice, "No, start with the next one" (BR-F05-04). `endDate` and
 * `pause` are refused: a Subscription is added running, then changed. The windows of `id`,
 * `createdAt` and `startDate` need the request clock: `createWindowIssues`.
 */
export const subscriptionCreateSchema = z
	.strictObject({
		id,
		name,
		amountMinor,
		currency,
		cadence,
		startDate: date,
		category,
		note,
		backfill: flag.default(false),
		createdAt: instant,
		endDate: notOnCreate,
		pause: notOnCreate,
		...SYSTEM_FIELDS,
	})
	.superRefine((body, ctx) => checkAmount(body, ctx))
	.transform(
		({
			id,
			name,
			amountMinor,
			currency,
			cadence,
			startDate,
			category,
			note,
			backfill,
			createdAt,
		}) => ({
			id,
			name,
			amountMinor,
			currency,
			cadence,
			startDate,
			category,
			note,
			backfill,
			createdAt,
		}),
	);
export type SubscriptionCreateBody = z.output<typeof subscriptionCreateSchema>;
/** What a client sends, before the schema fills its defaults. */
export type SubscriptionCreateInput = z.input<typeof subscriptionCreateSchema>;

/** The fields of a PATCH that change a stored value, as opposed to `changedAt` and the options. */
const CHANGE_FIELDS = [
	"name",
	"amountMinor",
	"cadence",
	"startDate",
	"category",
	"note",
	"endDate",
	"pause",
] as const;

/**
 * `PATCH /api/subscriptions/[id]` (F05 section 11): `changedAt` and the fields that changed,
 * with the options `skipDueOn`, `unskipDueOn`, `alsoPastCharges` and `backfillGap`
 * (BR-F05-30 to BR-F05-32, D-594).
 *
 * - at least one stored value changes; an options-only body is refused;
 * - an amount brings its currency;
 * - `alsoPastCharges` goes with a name or category change, `skipDueOn` with a start or cadence
 *   change, `backfillGap` with an end date, and not both `skipDueOn` and `unskipDueOn`.
 *
 * `endDate` is a date or `null`; `pause` an object or `null`. The windows need the clock
 * (`editWindowIssues`), and the merged row's checks (an end date not before the start, a pause,
 * a skip date) need the stored row (`rules.ts`).
 */
export const subscriptionEditSchema = z
	.strictObject({
		changedAt: instant,
		name: name.optional(),
		amountMinor: amountMinor.optional(),
		currency: currency.optional(),
		cadence: cadence.optional(),
		startDate: date.optional(),
		category: category.optional(),
		note: note.optional(),
		endDate: date.nullable().optional(),
		pause: pause.nullable().optional(),
		skipDueOn: date.optional(),
		unskipDueOn: date.optional(),
		alsoPastCharges: flag.optional(),
		backfillGap: flag.optional(),
		id: setByDaybook,
		createdAt: z.never({ error: M.createdAtFixed }).optional(),
		...SYSTEM_FIELDS,
	})
	.superRefine((body, ctx) => {
		if (!CHANGE_FIELDS.some((field) => body[field] !== undefined)) {
			addIssue(ctx, null, M.nothingToChange);
		}
		if (body.amountMinor !== undefined && body.currency === undefined) {
			addIssue(ctx, "currency", M.currencyWithAmount);
		}
		checkAmount(body, ctx);
		if (
			body.alsoPastCharges === true
			&& body.name === undefined
			&& body.category === undefined
		) {
			addIssue(ctx, "alsoPastCharges", M.alsoPastWithValue);
		}
		if (
			body.skipDueOn !== undefined
			&& body.startDate === undefined
			&& body.cadence === undefined
		) {
			addIssue(ctx, "skipDueOn", M.skipDueOnWithSchedule);
		}
		if (body.backfillGap === true && body.endDate === undefined) {
			addIssue(ctx, "backfillGap", M.backfillGapWithEnd);
		}
		if (body.skipDueOn !== undefined && body.unskipDueOn !== undefined) {
			addIssue(ctx, "unskipDueOn", M.skipBoth);
		}
	});
export type SubscriptionEditBody = z.output<typeof subscriptionEditSchema>;
/** What a client sends, before the schema shapes it. */
export type SubscriptionEditInput = z.input<typeof subscriptionEditSchema>;

/**
 * `DELETE /api/subscriptions/[id]`: `{ changedAt }`, or `{ changedAt, undo: "create" }`, the
 * undo of an Add, allowed at version 1 only (BR-F05-34, D-589).
 */
export const subscriptionDeleteSchema = z.strictObject({
	changedAt: instant,
	undo: z.literal("create", { error: M.undo }).optional(),
});
export type SubscriptionDeleteBody = z.output<typeof subscriptionDeleteSchema>;
export type SubscriptionDeleteInput = z.input<typeof subscriptionDeleteSchema>;

/** `POST /api/subscriptions/[id]/skips`: `{ dueOn, changedAt }` (BR-F05-26). */
export const subscriptionSkipSchema = z.strictObject({
	dueOn: date,
	changedAt: instant,
});
export type SubscriptionSkipBody = z.output<typeof subscriptionSkipSchema>;
export type SubscriptionSkipInput = z.input<typeof subscriptionSkipSchema>;

/** `DELETE /api/subscriptions/[id]/skips/[dueOn]`: `{ changedAt }` (BR-F05-27). */
export const subscriptionUnskipSchema = z.strictObject({ changedAt: instant });
export type SubscriptionUnskipBody = z.output<typeof subscriptionUnskipSchema>;
export type SubscriptionUnskipInput = z.input<typeof subscriptionUnskipSchema>;

/** `POST /api/sync/catch-up`: `{}` (BR-F05-06). */
export const subscriptionCatchUpBodySchema = z.strictObject({});

/** The `[dueOn]` of a skip's path. */
export const skipDateParamSchema = date;

const month = z.string({ error: M.month }).refine(isMonth, { error: M.month });

/** How many months a months read may span, and how far from the current month it may reach
 * (BR-F05-36, D-596). */
export const MONTHS_MAX_SPAN = 24;
export const MONTHS_WINDOW = 120;

/**
 * `GET /api/subscriptions/months?from=YYYY-MM&to=YYYY-MM` (BR-F05-36): both months well formed,
 * `from` not after `to`, and at most 24 months between them. Whether they lie within 120 months
 * of the current month needs the clock: `monthsWindowIssues`.
 */
export const subscriptionMonthsQuerySchema = z
	.strictObject({ from: month, to: month })
	.superRefine((query, ctx) => {
		if (!isMonth(query.from) || !isMonth(query.to)) return;
		const span = monthsFrom(query.from, query.to);
		if (span < 0) addIssue(ctx, "from", M.monthsOrder);
		else if (span + 1 > MONTHS_MAX_SPAN) addIssue(ctx, "to", M.monthsSpan);
	});
export type SubscriptionMonthsQuery = z.output<typeof subscriptionMonthsQuerySchema>;

/** The months a read may reach: 120 months either side of the current month. */
export function monthsWindow(current: Month): { first: Month; last: Month } {
	return {
		first: shiftMonth(current, -MONTHS_WINDOW),
		last: shiftMonth(current, MONTHS_WINDOW),
	};
}

/** Why a months read is outside the window, or none (BR-F05-36). */
export function monthsWindowIssues(
	query: { from: Month; to: Month },
	current: Month,
): FieldIssue[] {
	const { first, last } = monthsWindow(current);
	const issues: FieldIssue[] = [];
	for (const field of ["from", "to"] as const) {
		const value = query[field];
		if (value < first || value > last) {
			issues.push({
				path: [field],
				message: monthsWindowMessage(first, last),
			});
		}
	}
	return issues;
}

// --- Windows that need the request clock (D-257, D-267, BR-P2-43) -----------------------------------

const DAY = 86_400_000;

/** How far back a `createdAt` or `changedAt` may lie, and how far ahead (D-267). */
export const INSTANT_WINDOW = { daysBack: 90, minutesAhead: 5 } as const;

/** Whether `instant` lies from 90 days before to 5 minutes after `now`: `old`, `future` or
 * `null` (D-267). */
export function instantProblem(value: string, now: Date): "old" | "future" | null {
	const time = new Date(value).getTime();
	if (time < now.getTime() - INSTANT_WINDOW.daysBack * DAY) return "old";
	if (time > now.getTime() + INSTANT_WINDOW.minutesAhead * 60_000) return "future";
	return null;
}

/** The dates a start date may take: from 10 years before to 1 year after `date`, the recording
 * date of a create or the change date of an edit (D-257). */
export function startDateWindow(date: string): { min: string; max: string } {
	return { min: monthsBefore(date, 120), max: shiftMonths(date, 12) };
}

/** The last date an end date may take: 10 years after the change date (F05 section 3). */
export function endDateMax(changeDate: string): string {
	return shiftMonths(changeDate, 120);
}

/** A write's `changedAt` window (D-267): 422 "too old" before it, and a time that lies ahead. */
export function changedAtIssues(changedAt: string, now: Date): FieldIssue[] {
	const problem = instantProblem(changedAt, now);
	if (problem === "old") return [{ path: ["changedAt"], message: M.changeTooOld }];
	if (problem === "future")
		return [{ path: ["changedAt"], message: M.changeInFuture }];
	return [];
}

/** A create's windows (BR-P2-43, D-257, D-267): `id` no more than 5 minutes ahead, `createdAt`
 * from 90 days back to 5 minutes ahead, and `startDate` within 10 years back and 1 year ahead
 * of the recording date. */
export function createWindowIssues(
	body: { id: string; createdAt: string; startDate: string },
	{ now, timezone }: { now: Date; timezone: string },
): FieldIssue[] {
	const issues: FieldIssue[] = [];
	if (uuidV7Time(body.id) > now.getTime() + INSTANT_WINDOW.minutesAhead * 60_000) {
		issues.push({ path: ["id"], message: M.idInFuture });
	}
	const problem = instantProblem(body.createdAt, now);
	if (problem === "old")
		issues.push({ path: ["createdAt"], message: M.changeTooOld });
	if (problem === "future")
		issues.push({ path: ["createdAt"], message: M.createdAtInFuture });
	const recordingDate = recordingDateOf({
		createdAt: body.createdAt,
		timezone,
		now,
	});
	const { min, max } = startDateWindow(recordingDate);
	if (body.startDate < min || body.startDate > max) {
		issues.push({
			path: ["startDate"],
			message: startDateRangeMessage(min, max),
		});
	}
	return issues;
}

/** An edit's windows that need only the change date C (D-257): a new `startDate` within 10
 * years back and 1 year ahead of C, and a new `endDate` no more than 10 years after C. The
 * end date's lower bound, the merged start date, needs the stored row: `endDateIssues`. */
export function editWindowIssues(
	body: { startDate?: string | undefined; endDate?: string | null | undefined },
	changeDate: string,
): FieldIssue[] {
	const issues: FieldIssue[] = [];
	if (body.startDate !== undefined) {
		const { min, max } = startDateWindow(changeDate);
		if (body.startDate < min || body.startDate > max) {
			issues.push({
				path: ["startDate"],
				message: startDateRangeMessage(min, max),
			});
		}
	}
	if (typeof body.endDate === "string") {
		const last = endDateMax(changeDate);
		if (body.endDate > last) {
			issues.push({ path: ["endDate"], message: endDateLimitMessage(last) });
		}
	}
	return issues;
}

/** An end date before the start date, judged on the merged row (F05 section 8). */
export function endDateIssues(
	startDate: string,
	endDate: string | null,
): FieldIssue[] {
	return endDate !== null && endDate < startDate ?
			[{ path: ["endDate"], message: M.endBeforeStart }]
		:	[];
}
