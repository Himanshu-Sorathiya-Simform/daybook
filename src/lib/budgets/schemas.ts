import { tz } from "@date-fns/tz";
import { format, parse } from "date-fns";
import { z } from "zod";

import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { compareCodeUnits } from "@/lib/compare";
import { CURRENCY_EXPONENTS, maxMinor, type CurrencyCode } from "@/lib/currency";
import { isUuidV7 } from "@/lib/ids";
import {
	largestAmountMessage,
	TRANSACTION_MESSAGES,
} from "@/lib/transactions/schemas";

import {
	type BudgetRules,
	type ExpenseCategory,
	type MonthLimit,
	normalizeSchedule,
	type ScheduleEntry,
} from "./model";
import {
	isMonth,
	type Month,
	type MonthRange,
	RESTORE_FIRST,
	RESTORE_LAST,
} from "./months";

/** F04 section 8's messages, and the API-only ones a client sees only when it breaks a rule. */
export const BUDGET_MESSAGES = {
	categoryRequired: "Choose a category.",
	limitRequired: "Enter a limit.",
	limitZero: TRANSACTION_MESSAGES.amountZero,
	limitWhole: TRANSACTION_MESSAGES.amountWhole,
	currency: TRANSACTION_MESSAGES.currency,
	currencyWithLimit: "Send the currency with the limit.",
	stopRemovesEveryMonth:
		"This would remove every month. Delete the Budget instead.",
	id: TRANSACTION_MESSAGES.id,
	month: "Use a month as YYYY-MM.",
	scope: 'Send "month" as the scope of a one-month change.',
	shape: "Send a change from a month, a change for one month, or a whole schedule.",
	restoreMonth: "Use a month from Jan 2000 to Dec 2099.",
	scheduleOrder: "List the schedule's months in order, each once.",
	scheduleNeedsLimit: "A Budget needs at least one month with a limit.",
	overrideMonths: "Give each one-month limit its own month.",
	notWithScope: "Send this field only with its kind of change.",
} as const;

const M = BUDGET_MESSAGES;

const UTC = tz("UTC");

/** "Nov 2023", as F04 section 8 writes a month in a message. */
function shortMonth(month: Month): string {
	return format(parse(month, "yyyy-MM", new Date(0), { in: UTC }), "MMM yyyy", {
		in: UTC,
	});
}

/** "Choose a month from Nov 2023 to Nov 2027." (F04 section 8, BR-F04-07). */
export function monthRangeMessage(range: MonthRange): string {
	return `Choose a month from ${shortMonth(range.first)} to ${shortMonth(range.last)}.`;
}

const CURRENCIES = Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[];

const id = z
	.string({ error: M.id })
	.refine(isUuidV7, { error: M.id })
	.transform((value) => value.toLowerCase());
const category = z.enum(EXPENSE_CATEGORIES, { error: M.categoryRequired });
const currency = z.enum(CURRENCIES, { error: M.currency });
const month = z.string({ error: M.month }).refine(isMonth, { error: M.month });
const limit = z
	.number({ error: M.limitWhole })
	.int({ error: M.limitWhole })
	.min(1, { error: M.limitZero });
const restoreMonth = month.refine(
	(value) => value >= RESTORE_FIRST && value <= RESTORE_LAST,
	{
		error: M.restoreMonth,
		when: (payload) => isMonth(payload.value),
	},
);
const scheduleEntry = z.strictObject({
	from: restoreMonth,
	limitMinor: limit.nullable(),
});
const monthLimit = z.strictObject({
	month: restoreMonth,
	limitMinor: limit.nullable(),
});

function addIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string) {
	ctx.addIssue({ code: "custom", message, path });
}

/** Every limit at or below the currency's largest (MON-5). Reads only fields that passed. */
function checkLimits(
	ctx: z.RefinementCtx,
	currencyValue: CurrencyCode | undefined,
	limits: { path: (string | number)[]; value: unknown }[],
) {
	if (!CURRENCIES.includes(currencyValue as CurrencyCode)) return;
	const largest = maxMinor(currencyValue as CurrencyCode);
	for (const { path, value } of limits) {
		if (Number.isSafeInteger(value) && (value as number) > largest) {
			addIssue(ctx, path, largestAmountMessage(currencyValue as CurrencyCode));
		}
	}
}

/** A restoring write's lists (BR-F04-33): the schedule's months strictly increasing, at least
 * one limit once normalized, and one-month limits in distinct months. */
function checkRestore(
	ctx: z.RefinementCtx,
	schedule: readonly ScheduleEntry[] | undefined,
	overrides: readonly MonthLimit[] | undefined,
) {
	if (Array.isArray(schedule)) {
		const months = schedule.map((entry) => entry?.from);
		if (
			months.every(isMonth)
			&& months.some(
				(value, index) => index > 0 && value <= (months[index - 1] as Month),
			)
		) {
			addIssue(ctx, ["schedule"], M.scheduleOrder);
		}
		const valid = schedule.every(
			(entry) =>
				isMonth(entry?.from)
				&& (entry.limitMinor === null
					|| Number.isSafeInteger(entry.limitMinor)),
		);
		if (valid && normalizeSchedule(schedule).length === 0) {
			addIssue(ctx, ["schedule"], M.scheduleNeedsLimit);
		}
	}
	if (Array.isArray(overrides)) {
		const months = overrides.map((each) => each?.month).filter(isMonth);
		if (new Set(months).size !== months.length) {
			addIssue(ctx, ["overrides"], M.overrideMonths);
		}
	}
}

const restoreLimits = (body: {
	schedule?: readonly ScheduleEntry[] | undefined;
	overrides?: readonly MonthLimit[] | undefined;
}) => [
	...(body.schedule ?? []).map((entry, index) => ({
		path: ["schedule", index, "limitMinor"],
		value: entry?.limitMinor,
	})),
	...(body.overrides ?? []).map((each, index) => ({
		path: ["overrides", index, "limitMinor"],
		value: each?.limitMinor,
	})),
];

/** The lists a restoring write stores: the schedule normalized (BR-F04-05), the one-month
 * limits as sent, in month order (BR-F04-33). */
function restored(
	schedule: readonly ScheduleEntry[],
	overrides: readonly MonthLimit[],
): BudgetRules {
	return {
		schedule: normalizeSchedule(schedule),
		overrides: [...overrides]
			.sort((a, b) => compareCodeUnits(a.month, b.month))
			.map(({ month: each, limitMinor }) => ({ month: each, limitMinor })),
	};
}

export type BudgetCreateBody =
	| {
			kind: "from";
			id: string;
			category: ExpenseCategory;
			from: Month;
			limitMinor: number;
			currency: CurrencyCode;
	  }
	| ({
			kind: "restore";
			id: string;
			category: ExpenseCategory;
			currency: CurrencyCode;
	  } & BudgetRules);

/**
 * `POST /api/budgets` (F04 section 11): `{ id, category, from, limitMinor, currency }`, or a
 * restoring `{ id, category, schedule, overrides, currency }` (BR-F04-33). Checks the shape,
 * limits against the currency's largest, and a restoring body's lists. The range of `from`
 * (BR-F04-07) needs the user's current month and stays on the server.
 */
export const budgetCreateSchema = z
	.strictObject({
		id,
		category,
		currency,
		from: month.optional(),
		limitMinor: limit.nullable().optional(),
		schedule: z.array(scheduleEntry, { error: M.shape }).optional(),
		overrides: z.array(monthLimit, { error: M.shape }).optional(),
	})
	.superRefine((body, ctx) => {
		const restoring =
			body.schedule !== undefined || body.overrides !== undefined;
		if (restoring) {
			if (body.schedule === undefined) addIssue(ctx, ["schedule"], M.shape);
			if (body.overrides === undefined) addIssue(ctx, ["overrides"], M.shape);
			if (body.from !== undefined) addIssue(ctx, ["from"], M.notWithScope);
			if (body.limitMinor !== undefined)
				addIssue(ctx, ["limitMinor"], M.notWithScope);
			checkRestore(ctx, body.schedule, body.overrides);
			checkLimits(ctx, body.currency, restoreLimits(body));
			return;
		}
		if (body.from === undefined) addIssue(ctx, ["from"], M.month);
		if (body.limitMinor == null) addIssue(ctx, ["limitMinor"], M.limitRequired);
		checkLimits(ctx, body.currency, [
			{ path: ["limitMinor"], value: body.limitMinor },
		]);
	})
	.transform((body): BudgetCreateBody => {
		const { id: bodyId, category: bodyCategory, currency: bodyCurrency } = body;
		if (body.schedule !== undefined) {
			return {
				kind: "restore",
				id: bodyId,
				category: bodyCategory,
				currency: bodyCurrency,
				...restored(body.schedule, body.overrides as MonthLimit[]),
			};
		}
		return {
			kind: "from",
			id: bodyId,
			category: bodyCategory,
			from: body.from as Month,
			limitMinor: body.limitMinor as number,
			currency: bodyCurrency,
		};
	});
/** What a client sends, before the schema shapes it. */
export type BudgetCreateInput = z.input<typeof budgetCreateSchema>;

export type BudgetEditBody =
	| {
			kind: "from";
			from: Month;
			limitMinor: number | null;
			currency: CurrencyCode | undefined;
	  }
	| {
			kind: "month";
			month: Month;
			limitMinor: number | null;
			currency: CurrencyCode | undefined;
	  }
	| ({ kind: "restore"; currency: CurrencyCode } & BudgetRules);

/**
 * `PATCH /api/budgets/[id]` (F04 section 11, D-561), one of:
 * - `{ from, limitMinor, currency }`: from a month onward (BR-F04-03, BR-F04-04);
 * - `{ month, limitMinor, currency, scope: "month" }`: one month (BR-F04-24);
 * - `{ schedule, overrides, currency }`: restoring (BR-F04-33).
 *
 * `limitMinor` may be `null`; `currency` comes with every limit (BR-F04-22). Fields of another
 * shape are refused, never dropped. The month range, the stop that removes every month and
 * the currency match need the stored row or the request and stay on the server.
 */
export const budgetEditSchema = z
	.strictObject({
		from: month.optional(),
		month: month.optional(),
		scope: z.literal("month", { error: M.scope }).optional(),
		limitMinor: limit.nullable().optional(),
		currency: currency.optional(),
		schedule: z.array(scheduleEntry, { error: M.shape }).optional(),
		overrides: z.array(monthLimit, { error: M.shape }).optional(),
	})
	.superRefine((body, ctx) => {
		const foreign = (fields: (keyof typeof body)[]) => {
			for (const field of fields) {
				if (body[field] !== undefined)
					addIssue(ctx, [field], M.notWithScope);
			}
		};
		if (body.schedule !== undefined || body.overrides !== undefined) {
			if (body.schedule === undefined) addIssue(ctx, ["schedule"], M.shape);
			if (body.overrides === undefined) addIssue(ctx, ["overrides"], M.shape);
			if (body.currency === undefined)
				addIssue(ctx, ["currency"], M.currencyWithLimit);
			foreign(["from", "month", "scope", "limitMinor"]);
			checkRestore(ctx, body.schedule, body.overrides);
			checkLimits(ctx, body.currency, restoreLimits(body));
			return;
		}
		if (body.scope !== undefined || body.month !== undefined) {
			if (body.scope === undefined) addIssue(ctx, ["scope"], M.scope);
			if (body.month === undefined) addIssue(ctx, ["month"], M.month);
			foreign(["from"]);
		} else if (body.from === undefined) {
			addIssue(ctx, [], M.shape);
			return;
		}
		if (body.limitMinor === undefined)
			addIssue(ctx, ["limitMinor"], M.limitRequired);
		if (typeof body.limitMinor === "number" && body.currency === undefined) {
			addIssue(ctx, ["currency"], M.currencyWithLimit);
		}
		checkLimits(ctx, body.currency, [
			{ path: ["limitMinor"], value: body.limitMinor },
		]);
	})
	.transform((body): BudgetEditBody => {
		if (body.schedule !== undefined) {
			return {
				kind: "restore",
				currency: body.currency as CurrencyCode,
				...restored(body.schedule, body.overrides as MonthLimit[]),
			};
		}
		if (body.scope !== undefined) {
			return {
				kind: "month",
				month: body.month as Month,
				limitMinor: body.limitMinor as number | null,
				currency: body.currency,
			};
		}
		return {
			kind: "from",
			from: body.from as Month,
			limitMinor: body.limitMinor as number | null,
			currency: body.currency,
		};
	});
/** What a client sends, before the schema shapes it. */
export type BudgetEditInput = z.input<typeof budgetEditSchema>;

/** `DELETE /api/budgets/[id]` and `DELETE /api/budgets/[id]/overrides/[month]`: `{}`. */
export const budgetDeleteSchema = z.strictObject({});
