import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { Transaction } from "@/lib/transactions/model";
import {
	TRANSACTION_MESSAGES as M,
	type TransactionEditBody,
	typeChangeAllowed,
	typeRuleIssues,
} from "@/lib/transactions/schemas";
import { ApiError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency, requireCurrency } from "../currency";
import type { Tx } from "../with-user";
import { entryWindow, inWindow, pastSlack } from "./dates";
import { getTransaction } from "./get";
import { readRow, ROW_JSON, type RowJson } from "./row";

/** The sent value, or the stored one when the field was not sent. `null` is a sent value. */
function merged<T>(sent: T | undefined, stored: T): T {
	return sent === undefined ? stored : sent;
}

function sameInstant(a: string, b: string): boolean {
	return Date.parse(a) === Date.parse(b);
}

/**
 * Step 2 of section 11 for an edit (BR-F03-02, BR-F03-11, BR-F03-16, BR-F03-18, BR-F03-23;
 * D-486): every refusal at once, as 422 `validation_failed`, one message per field.
 * 1. A charge's type, and a charge's or demo row's date and time, are fixed. A field sent with
 *    its stored value is no change.
 * 2. Otherwise the type changes only within its group.
 * 3. The merged row passes the type rules. A refused type is judged as the stored one, so the
 *    other messages are about what the client can still fix.
 */
function checkEditFields(stored: Transaction, body: TransactionEditBody): void {
	const fields: Record<string, string> = {};
	const charge = stored.source === "subscription";
	if (body.type !== undefined && body.type !== stored.type) {
		if (charge) fields["type"] = M.chargeTypeFixed;
		else if (!typeChangeAllowed(stored.type, body.type)) {
			fields["type"] = M.typeGroupFixed;
		}
	}
	if (charge || stored.demo) {
		if (
			body.occurredAt !== undefined
			&& !sameInstant(body.occurredAt, stored.occurredAt)
		) {
			fields["occurredAt"] = M.dateTimeFixed;
		}
		if (body.occurredOn !== undefined && body.occurredOn !== stored.occurredOn) {
			fields["occurredOn"] = M.dateTimeFixed;
		}
	}

	const issues = typeRuleIssues({
		type: fields["type"] ? stored.type : merged(body.type, stored.type),
		category: merged(body.category, stored.category),
		goalId: merged(body.goalId, stored.goalId),
		payee: merged(body.payee, stored.payee),
		description: merged(body.description, stored.description),
	});
	// The type rules never name `type`, `occurredAt` or `occurredOn`, so nothing is overwritten.
	for (const { path, message } of issues) fields[path] = message;
	if (Object.keys(fields).length > 0)
		throw new ApiError("validation_failed", { fields });
}

/**
 * Step 4 for an edit (TIME-7, BR-F03-09, BR-F03-11; D-484): only a changed value is checked,
 * and the schema has already checked that `occurredOn` fits `occurredAt`.
 * 1. A new `occurredAt` may run at most 5 minutes past the request clock.
 * 2. A new `occurredOn` lies in the window of the stored `createdAt`, read in the current
 *    profile zone. Keeping the date skips the window, even after a zone change.
 */
function checkEditDates(
	ctx: ProfiledContext,
	stored: Transaction,
	body: TransactionEditBody,
): void {
	if (
		body.occurredAt !== undefined
		&& !sameInstant(body.occurredAt, stored.occurredAt)
		&& pastSlack(body.occurredAt, ctx.now)
	) {
		throw new ApiError("validation_failed", {
			fields: { occurredAt: M.timeInFuture },
		});
	}
	if (body.occurredOn !== undefined && body.occurredOn !== stored.occurredOn) {
		const window = entryWindow(stored.createdAt, ctx.profile.timezone);
		if (!inWindow(body.occurredOn, window)) {
			throw new ApiError("date_out_of_window", {
				fields: { occurredOn: M.dateOutOfWindow },
				details: { ...window },
			});
		}
	}
}

/** The edit's columns. `goalId` has none until F06; the type rules refuse it on every M1 row,
 * since no row has a Goal type (D-465). */
const COLUMNS = {
	type: "type",
	amountMinor: "amount_minor",
	occurredAt: "occurred_at",
	occurredOn: "occurred_on",
	category: "category",
	payee: "payee",
	description: "description",
	note: "note",
} as const;

/** `SET` for the sent fields, `version` raised by one and `updated_at` the request clock
 * (BR-P2-21, BR-P2-43). */
function setClause(ctx: ProfiledContext, body: TransactionEditBody): SQL {
	const sets = Object.entries(COLUMNS)
		.filter(([field]) => body[field as keyof typeof COLUMNS] !== undefined)
		.map(
			([field, column]) =>
				sql`${sql.identifier(column)} = ${body[field as keyof typeof COLUMNS]}`,
		);
	return sql.join(
		[
			...sets,
			sql`version = version + 1`,
			sql`updated_at = ${ctx.now.toISOString()}`,
		],
		sql`, `,
	);
}

/**
 * Edits one of the user's Transactions at `If-Match` `version` (BR-F03-23), in section 11's
 * check order: the unlocked read (404 when missing, RLS hiding other users' rows); the field
 * checks (step 2); the profile lock, with the currency when one is sent (3); the dates (4);
 * then the versioned update (7). M1 has no Goal rows, so step 5 has nothing to check. When the
 * update matches nothing, the re-read gives 409 `version_conflict` with the current row and
 * currency in `details.current`, as `GET` answers it (D-485), or 404.
 */
export async function editTransaction(
	tx: Tx,
	ctx: ProfiledContext,
	id: string,
	version: number,
	body: TransactionEditBody,
): Promise<Transaction> {
	const stored = await getTransaction(tx, id);
	if (!stored) throw new ApiError("not_found");
	checkEditFields(stored, body);
	if (body.currency !== undefined) await requireCurrency(tx, body.currency);
	else await lockCurrency(tx);
	checkEditDates(ctx, stored, body);

	const { rows } = await tx.execute<{ row: RowJson }>(
		sql`UPDATE app.transactions SET ${setClause(ctx, body)}
		WHERE id = ${id}::uuid AND version = ${version}
		RETURNING ${ROW_JSON} AS row`,
	);
	const [updated] = rows;
	if (updated) return readRow(updated.row);

	const current = await getTransaction(tx, id);
	if (!current) throw new ApiError("not_found");
	throw new ApiError("version_conflict", {
		details: { current: { ...current, currency: ctx.profile.currency } },
	});
}
