import "server-only";
import { sql } from "drizzle-orm";
import type { CurrencyCode } from "@/lib/currency";
import { ApiError } from "../api/errors";
import type { Tx } from "./with-user";

/**
 * Locks the user's profile row against a currency change and returns its currency
 * (BR-F03-05, D-213). Every finance write takes this first, inside its write transaction.
 * `FOR KEY SHARE` waits for a currency change (F02, BR-F02-15) and for demo load and removal
 * (F15), and never blocks catch-up's update of `last_catch_up_on`.
 */
export async function lockCurrency(tx: Tx): Promise<CurrencyCode> {
	const { rows } = await tx.execute<{ currency: CurrencyCode }>(
		sql`SELECT currency FROM app.profile FOR KEY SHARE`,
	);
	const [profile] = rows;
	// The route already required a profile (BR-P2-13); RLS limits this to the user's own.
	if (!profile) throw new ApiError("profile_required");
	return profile.currency;
}

/** Locks the profile, then refuses a request whose `currency` differs from it with 422
 * `currency_mismatch` (API-6, BR-F03-05). */
export async function requireCurrency(tx: Tx, sent: CurrencyCode): Promise<void> {
	if ((await lockCurrency(tx)) !== sent) throw new ApiError("currency_mismatch");
}
