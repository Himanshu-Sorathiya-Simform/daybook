import "server-only";
import { sql } from "drizzle-orm";
import { uuidV7Time } from "@/lib/ids";
import type { Transaction } from "@/lib/transactions/model";
import {
	TRANSACTION_MESSAGES as M,
	type TransactionCreateBody,
} from "@/lib/transactions/schemas";
import { ApiError } from "../../api/errors";
import type { ProfiledContext } from "../context";
import { lockCurrency, type WithCurrency } from "../currency";
import type { Tx } from "../with-user";
import { entryWindow, inWindow, pastSlack } from "./dates";
import { getTransaction } from "./get";
import { readRow, ROW_JSON, type RowJson } from "./row";

/**
 * The date checks of a create, in F03 section 11's step 4 (TIME-7, BR-F03-08, BR-F03-09,
 * BR-P2-20; D-484, D-494). The schema has already checked that `occurredOn` fits `occurredAt`.
 * 1. The id's time may run at most 5 minutes past the request clock, and `occurredAt` at most
 *    5 minutes past both the request clock and `createdAt`: 422 `validation_failed` on each.
 * 2. `createdAt` may run at most 5 minutes ahead of the request clock: `date_out_of_window`.
 * 3. `occurredOn` lies in the window of `createdAt`: `date_out_of_window`, with the window.
 */
function checkCreateDates(ctx: ProfiledContext, body: TransactionCreateBody): void {
	const fields: Record<string, string> = {};
	if (pastSlack(new Date(uuidV7Time(body.id)), ctx.now))
		fields["id"] = M.idInFuture;
	if (
		pastSlack(body.occurredAt, body.createdAt)
		|| pastSlack(body.occurredAt, ctx.now)
	) {
		fields["occurredAt"] = M.timeInFuture;
	}
	if (Object.keys(fields).length > 0)
		throw new ApiError("validation_failed", { fields });

	if (pastSlack(body.createdAt, ctx.now)) {
		throw new ApiError("date_out_of_window", {
			fields: { createdAt: M.createdAtInFuture },
		});
	}
	const window = entryWindow(body.createdAt, ctx.profile.timezone);
	if (!inWindow(body.occurredOn, window)) {
		throw new ApiError("date_out_of_window", {
			fields: { occurredOn: M.dateOutOfWindow },
			details: { ...window },
		});
	}
}

/**
 * Creates a Transaction with the client's id (BR-F03-20, BR-P2-20), in section 11's check order:
 * the schema has run (steps 1 and 2); then the profile lock (3) and the id lookup, so an id
 * the user already has answers that row unchanged, whatever has moved since (API-5, D-493);
 * then the currency (3), the dates (4) and the Goal (5: at M1 no user has one, so any `goalId`
 * is `parent_missing`, D-483); then the insert (7). Source is `manual`, `demo` false,
 * `createdAt` the client's and `updatedAt` the request clock (BR-F03-19, D-485). An id that
 * is not the user's answers 409 `id_conflict`. Answers carry the locked currency.
 */
export async function createTransaction(
	tx: Tx,
	ctx: ProfiledContext,
	body: TransactionCreateBody,
): Promise<{ row: WithCurrency<Transaction>; created: boolean }> {
	const currency = await lockCurrency(tx);
	const existing = await getTransaction(tx, body.id);
	if (existing) return { row: { ...existing, currency }, created: false };

	if (currency !== body.currency) throw new ApiError("currency_mismatch");
	checkCreateDates(ctx, body);
	if (body.goalId !== null) {
		throw new ApiError("parent_missing", { fields: { goalId: M.goalRequired } });
	}

	const { rows } = await tx.execute<{ row: RowJson }>(
		sql`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			occurred_at, occurred_on, category, payee, description, note, source, demo, version)
		VALUES (${body.id}, ${ctx.user.id}, ${body.createdAt}, ${ctx.now.toISOString()}, ${body.type},
			${body.amountMinor}, ${body.occurredAt}, ${body.occurredOn}, ${body.category},
			${body.payee}, ${body.description}, ${body.note}, 'manual', false, 1)
		ON CONFLICT (id) DO NOTHING
		RETURNING ${ROW_JSON} AS row`,
	);
	const [inserted] = rows;
	if (inserted)
		return { row: { ...readRow(inserted.row), currency }, created: true };

	// The id exists: the user's own row is this create, committed by another request since the
	// lookup (API-5); anyone else's stays hidden by RLS.
	const raced = await getTransaction(tx, body.id);
	if (!raced) throw new ApiError("id_conflict");
	return { row: { ...raced, currency }, created: false };
}
