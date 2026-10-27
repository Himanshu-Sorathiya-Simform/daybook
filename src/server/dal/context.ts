import "server-only";

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
