import "server-only";
import { sql } from "drizzle-orm";
import type { CurrencyCode } from "@/lib/currency";
import type { WeekStart } from "@/lib/geo";
import { type ProfileAnswer, profileBlock } from "@/lib/profile";
import { profile } from "../../db/schema";
import type { Tx } from "../with-user";

/** The profile columns `/api/profile` answers with. */
export const PROFILE_COLUMNS = {
	country: profile.country,
	currency: profile.currency,
	timezone: profile.timezone,
	weekStart: profile.weekStart,
	version: profile.version,
};

type ProfileRow = {
	country: string;
	currency: string;
	timezone: string;
	weekStart: string;
	version: number;
};

/** Whether the currency may still change (BR-F02-14): the user has no Transactions. Budgets,
 * Subscriptions and Goals join the check with their tables (M2). RLS limits the count to the
 * user's own rows. */
export async function currencyEditable(tx: Tx): Promise<boolean> {
	const { rows } = await tx.execute<{ editable: boolean }>(
		sql`SELECT NOT EXISTS (SELECT 1 FROM app.transactions) AS editable`,
	);
	// A SELECT without FROM always answers one row.
	return (rows as [{ editable: boolean }])[0].editable;
}

/** A profile row as every `/api/profile` answer gives it (BR-F02-26, D-506). The currency is
 * a key of `app.currencies` and the week start one of three, which the table's foreign key
 * and check guarantee. */
export async function answerFor(tx: Tx, row: ProfileRow): Promise<ProfileAnswer> {
	return {
		profile: profileBlock({
			country: row.country,
			currency: row.currency as CurrencyCode,
			timezone: row.timezone,
			weekStart: row.weekStart as WeekStart,
		}),
		version: row.version,
		currencyEditable: await currencyEditable(tx),
	};
}

/** The user's profile as `GET /api/profile` answers it, or `null` before onboarding. */
export async function readProfileAnswer(tx: Tx): Promise<ProfileAnswer | null> {
	const [row] = await tx.select(PROFILE_COLUMNS).from(profile).limit(1);
	return row ? answerFor(tx, row) : null;
}
