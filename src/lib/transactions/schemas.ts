import { addHours, subHours } from "date-fns";
import { z } from "zod";

import { formatAmountInput } from "@/lib/amount";
import type { CategoryKey } from "@/lib/categories";
import { CURRENCY_EXPONENTS, maxMinor, type CurrencyCode } from "@/lib/currency";
import { isUuidV7 } from "@/lib/ids";
import { optionalTextSchema } from "@/lib/text";
import { isIsoDate, utcDate } from "@/lib/time";

import {
	CATEGORY_KEYS,
	TXN_TYPES,
	TYPE_GROUPS,
	categoriesFor,
	isGoalType,
	type Source,
	type TxnType,
} from "./model";

/** A Transaction as the API returns it (F03 section 3). From M2, Goal rows add `goal` and
 * linked charges add `subscription`, so the list needs no extra lookups. */
export type Transaction = {
	id: string;
	type: TxnType;
	amountMinor: number;
	occurredAt: string;
	occurredOn: string;
	category: CategoryKey | null;
	goalId: string | null;
	payee: string | null;
	description: string | null;
	note: string | null;
	source: Source;
	demo: boolean;
	subscriptionId: string | null;
	dueOn: string | null;
	edited: boolean;
	version: number;
	createdAt: string;
	updatedAt: string;
	goal?: { id: string; name: string; icon: string; color: string };
	subscription?: { id: string; name: string };
};

/** F03 section 8's messages, and the API-only ones a client sees only when it breaks a rule. */
export const TRANSACTION_MESSAGES = {
	amountZero: "Enter an amount above zero.",
	amountWhole: "Send the amount as a whole number of minor units.",
	payeeRequired: "Enter who you paid, or who paid you.",
	categoryRequired: "Choose a category.",
	goalRequired: "Choose a Goal.",
	typeRequired: "Choose a type.",
	goalNoPayee: "Goal Transactions have no payee.",
	goalNoCategory: "Goal Transactions have no category.",
	goalNoDescription: "Goal Transactions have no description.",
	onlyGoalHasGoal: "Only Goal Transactions have a Goal.",
	currency: "Use a supported currency.",
	currencyWithAmount: "Send the currency with the amount.",
	systemField: "Daybook sets this field.",
	createdAtFixed: "The recording time can't change.",
	instant: "Use an ISO date and time in UTC.",
	wholeMinutes: "Use a time in whole minutes.",
	date: "Use a date as YYYY-MM-DD.",
	dateDoesNotFit: "The date doesn't match the time.",
	dateAndTimeTogether: "Send the date and time together.",
	id: "Use a UUIDv7 id.",
	nothingToChange: "Send at least one change.",
	idInFuture: "This item's time is in the future. Check your device's clock.",
	timeInFuture: "The time can't be in the future.",
	createdAtInFuture: "The recording time can't be in the future.",
	dateOutOfWindow: "Choose today or one of the 10 days before.",
	chargeTypeFixed: "A charge's type can't change.",
	dateTimeFixed: "This Transaction's date and time can't change.",
	typeGroupFixed:
		"Delete this Transaction and add a new one to change to this type.",
	hintTogether: "Send the Subscription and due date together.",
} as const;

const M = TRANSACTION_MESSAGES;

/** "The largest amount is 999,999,999.99.", with the currency's decimals (MON-5). */
export function largestAmountMessage(currency: CurrencyCode): string {
	const largest = formatAmountInput(maxMinor(currency), {
		currency,
		numberLocale: "en-US-u-nu-latn",
	});
	return `The largest amount is ${largest}.`;
}

const INSTANT =
	/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?Z$/;

function isInstant(text: string): boolean {
	const match = INSTANT.exec(text);
	return match !== null && isIsoDate(match[1] as string);
}

/** Minute precision: seconds and milliseconds are zero (BR-F03-06, D-221). */
function inWholeMinutes(text: string): boolean {
	const match = INSTANT.exec(text);
	return match?.[4] === "00" && /^0*$/.test(match[5] ?? "");
}

/**
 * Whether `occurredOn` is a date that `occurredAt` has at some real UTC offset, from −12:00 to
 * +14:00 (BR-F03-10, D-220). The profile zone plays no part, so a time-zone change between an
 * offline write and its sync cannot reject a correct row.
 */
export function occurredOnFits(occurredAt: string, occurredOn: string): boolean {
	const instant = new Date(occurredAt);
	return (
		occurredOn >= utcDate(subHours(instant, 12))
		&& occurredOn <= utcDate(addHours(instant, 14))
	);
}

/** Whether an edit may change `from` into `to`: only within its group (BR-F03-02, D-222). */
export function typeChangeAllowed(from: TxnType, to: TxnType): boolean {
	return TYPE_GROUPS.some(
		(group) =>
			(group as readonly TxnType[]).includes(from)
			&& (group as readonly TxnType[]).includes(to),
	);
}

export type TypeRuleFields = {
	type: TxnType;
	category: CategoryKey | string | null;
	goalId: string | null;
	payee: string | null;
	description: string | null;
};

/**
 * The type rules (BR-F03-01, TXN-1 to TXN-4) as field issues: what the type requires and what
 * it forbids. A forbidden field is refused, never dropped. The server runs this on the merged
 * row of an edit, since an edit sends only the fields that changed.
 */
export function typeRuleIssues(
	row: TypeRuleFields,
): { path: string; message: string }[] {
	const issues: { path: string; message: string }[] = [];
	if (isGoalType(row.type)) {
		if (row.goalId === null)
			issues.push({ path: "goalId", message: M.goalRequired });
		if (row.category !== null)
			issues.push({ path: "category", message: M.goalNoCategory });
		if (row.payee !== null)
			issues.push({ path: "payee", message: M.goalNoPayee });
		if (row.description !== null) {
			issues.push({ path: "description", message: M.goalNoDescription });
		}
		return issues;
	}
	if (row.goalId !== null)
		issues.push({ path: "goalId", message: M.onlyGoalHasGoal });
	const categories: readonly string[] = categoriesFor(row.type);
	if (row.category === null || !categories.includes(row.category)) {
		issues.push({ path: "category", message: M.categoryRequired });
	}
	if (row.payee === null) issues.push({ path: "payee", message: M.payeeRequired });
	return issues;
}

const CURRENCIES = Object.keys(CURRENCY_EXPONENTS) as CurrencyCode[];

const id = z
	.string({ error: M.id })
	.refine(isUuidV7, { error: M.id })
	.transform((value) => value.toLowerCase());
const type = z.enum(TXN_TYPES, { error: M.typeRequired });
const amountMinor = z
	.number({ error: M.amountWhole })
	.int({ error: M.amountWhole })
	.min(1, { error: M.amountZero });
const currency = z.enum(CURRENCIES, { error: M.currency });
const instant = z
	.string({ error: M.instant })
	.refine(isInstant, { error: M.instant });
const occurredAt = instant.refine(inWholeMinutes, {
	error: M.wholeMinutes,
	when: (payload) => isInstant(String(payload.value)),
});
const date = z.string({ error: M.date }).refine(isIsoDate, { error: M.date });
const category = z.enum(CATEGORY_KEYS, { error: M.categoryRequired });
const goalId = z
	.string({ error: M.goalRequired })
	.refine(isUuidV7, { error: M.goalRequired })
	.transform((value) => value.toLowerCase());
const payee = optionalTextSchema({ max: 80 });
const description = optionalTextSchema({ max: 120 });
const note = optionalTextSchema({ max: 500, multiline: true });
const setByDaybook = z.never({ error: M.systemField }).optional();

/** Fields only Daybook sets (BR-F03-19), refused by name rather than as unknown keys. */
const SYSTEM_FIELDS = {
	source: setByDaybook,
	demo: setByDaybook,
	edited: setByDaybook,
	subscriptionId: setByDaybook,
	dueOn: setByDaybook,
	version: setByDaybook,
	updatedAt: setByDaybook,
};

function addIssue(ctx: z.RefinementCtx, path: string | null, message: string) {
	ctx.addIssue({ code: "custom", message, path: path === null ? [] : [path] });
}

/** The amount, date and currency rules a create and an edit share. */
function checkAmountAndDate(
	body: {
		amountMinor?: number | undefined;
		currency?: CurrencyCode | undefined;
		occurredAt?: string | undefined;
		occurredOn?: string | undefined;
	},
	ctx: z.RefinementCtx,
) {
	// Object checks run even when a field failed, so each reads only fields that passed.
	const { amountMinor, currency, occurredAt, occurredOn } = body;
	if (
		Number.isSafeInteger(amountMinor)
		&& CURRENCIES.includes(currency as CurrencyCode)
	) {
		if ((amountMinor as number) > maxMinor(currency as CurrencyCode)) {
			addIssue(
				ctx,
				"amountMinor",
				largestAmountMessage(currency as CurrencyCode),
			);
		}
	}
	if (
		typeof occurredAt === "string"
		&& isInstant(occurredAt)
		&& isIsoDate(occurredOn ?? "")
	) {
		if (!occurredOnFits(occurredAt, occurredOn as string)) {
			addIssue(ctx, "occurredOn", M.dateDoesNotFit);
		}
	}
}

/**
 * `POST /api/transactions` (F03 section 11). Checks the shape, the type rules, text limits,
 * the amount against the currency's largest, and that `occurredOn` fits `occurredAt`. The
 * entry window, the future-time limit, the currency match and Goal state need the request
 * context and stay on the server (BR-F03-05 to BR-F03-09, BR-F03-13).
 */
export const transactionCreateSchema = z
	.strictObject({
		id,
		type,
		amountMinor,
		currency,
		occurredAt,
		occurredOn: date,
		createdAt: instant,
		category: category.nullish().transform((value) => value ?? null),
		goalId: goalId.nullish().transform((value) => value ?? null),
		payee,
		description,
		note,
		...SYSTEM_FIELDS,
	})
	.superRefine((body, ctx) => {
		checkAmountAndDate(body, ctx);
		for (const issue of typeRuleIssues(body))
			addIssue(ctx, issue.path, issue.message);
	})
	.transform(
		({
			id,
			type,
			amountMinor,
			currency,
			occurredAt,
			occurredOn,
			createdAt,
			category,
			goalId,
			payee,
			description,
			note,
		}) => ({
			id,
			type,
			amountMinor,
			currency,
			occurredAt,
			occurredOn,
			createdAt,
			category,
			goalId,
			payee,
			description,
			note,
		}),
	);
export type TransactionCreateBody = z.output<typeof transactionCreateSchema>;

/**
 * `PATCH /api/transactions/[id]`: only the fields that changed (BR-F03-23). The date and time
 * come together or not at all, an amount brings its currency, and `createdAt` never moves.
 * The type rules apply to the merged row, so the server runs `typeRuleIssues` and
 * `typeChangeAllowed` against the stored row.
 */
export const transactionEditSchema = z
	.strictObject({
		type: type.optional(),
		amountMinor: amountMinor.optional(),
		currency: currency.optional(),
		occurredAt: occurredAt.optional(),
		occurredOn: date.optional(),
		// `null` is a sent value: a stored null is no change, and the merged row's type rules
		// judge any other (D-486).
		category: category.nullable().optional(),
		goalId: goalId.nullable().optional(),
		payee: payee.optional(),
		description: description.optional(),
		note: note.optional(),
		createdAt: z.never({ error: M.createdAtFixed }).optional(),
		id: setByDaybook,
		...SYSTEM_FIELDS,
	})
	.superRefine((body, ctx) => {
		if (Object.keys(body).length === 0) addIssue(ctx, null, M.nothingToChange);
		if (body.occurredAt !== undefined && body.occurredOn === undefined) {
			addIssue(ctx, "occurredOn", M.dateAndTimeTogether);
		}
		if (body.occurredOn !== undefined && body.occurredAt === undefined) {
			addIssue(ctx, "occurredAt", M.dateAndTimeTogether);
		}
		if (body.amountMinor !== undefined && body.currency === undefined) {
			addIssue(ctx, "currency", M.currencyWithAmount);
		}
		checkAmountAndDate(body, ctx);
	});
export type TransactionEditBody = z.output<typeof transactionEditSchema>;

/**
 * `DELETE /api/transactions/[id]`: `{}`, or a charge's cached `{ subscriptionId, dueOn }` as a
 * hint, both together (BR-F03-17), the one exception to BR-F03-19. At M1 no Subscription
 * exists, so the hint is checked for shape only; F05 uses it to write the tombstone (D-487).
 */
export const transactionDeleteSchema = z
	.strictObject({ subscriptionId: id.optional(), dueOn: date.optional() })
	.superRefine((body, ctx) => {
		if (body.subscriptionId !== undefined && body.dueOn === undefined) {
			addIssue(ctx, "dueOn", M.hintTogether);
		}
		if (body.dueOn !== undefined && body.subscriptionId === undefined) {
			addIssue(ctx, "subscriptionId", M.hintTogether);
		}
	});
export type TransactionDeleteBody = z.output<typeof transactionDeleteSchema>;
