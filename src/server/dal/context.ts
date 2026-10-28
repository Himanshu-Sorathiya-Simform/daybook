import "server-only";
import { todayIn } from "@/lib/time";
import { getAuth } from "../auth/auth";
import { profile as profileTable } from "../db/schema";
import type { Tx } from "./with-user";

/** The request context (P2 section 3). The route wrapper and `readAsUser` build it once per
 * request; until then, code and tests build it by hand. Capabilities join it with P4. */
export type RequestContext = {
	/** UUIDv7 from `proxy.ts` (BR-P2-30). */
	requestId: string;
	user: { id: string; email: string; name: string };
	/** `null` before onboarding (BR-P2-13). */
	profile: Profile | null;
	/** The request clock: read once per request, frozen in tests (BR-P2-43). */
	now: Date;
	/** `now` as a date in the profile timezone (TIME-5); `null` without a profile. */
	today: string | null;
	/** Whether this request's daily pass wrote prices (BR-P2-27; F05, BR-F05-06). */
	pricesUpdated: boolean;
};

export type Profile = {
	country: string;
	currency: string;
	timezone: string;
	weekStart: "monday" | "sunday" | "saturday";
	lastCatchUpOn: string;
};

/** Reads the server clock. Every business date and instant comes from `ctx.now`, which is
 * set from this once per request, so a request never sees the time move (BR-P2-43). */
export function readClock(): Date {
	return new Date();
}

/** The signed-in user, or `null` with no valid session (BR-P2-12). Read without extending
 * the session: only the app's own `/api/auth/get-session` call renews it with its cookie
 * (D-433). A database failure throws; it is never mistaken for "no session". */
export async function sessionUser(
	headers: Headers,
): Promise<RequestContext["user"] | null> {
	const session = await getAuth().api.getSession({
		headers,
		query: { disableRefresh: true },
	});
	if (!session) return null;
	const { id, email, name } = session.user;
	return { id, email, name };
}

/** The user's profile, read inside the request's transaction, where RLS limits it to the
 * user (BR-P2-17, step 11); `null` before onboarding. */
export async function readProfile(tx: Tx): Promise<Profile | null> {
	const [row] = await tx
		.select({
			country: profileTable.country,
			currency: profileTable.currency,
			timezone: profileTable.timezone,
			weekStart: profileTable.weekStart,
			lastCatchUpOn: profileTable.lastCatchUpOn,
		})
		.from(profileTable)
		.limit(1);
	return row ? { ...row, weekStart: row.weekStart as Profile["weekStart"] } : null;
}

/** `ctx` with its profile, and `today` from the profile's zone (TIME-5). */
export function withProfile(
	ctx: RequestContext,
	profile: Profile | null,
): RequestContext {
	return {
		...ctx,
		profile,
		today: profile ? todayIn(profile.timezone, ctx.now) : null,
	};
}
