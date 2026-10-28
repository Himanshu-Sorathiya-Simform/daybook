import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { requestIdOf, queuePending } from "../api/checks";
import { PATH_HEADER } from "../security/proxy";
import { runDailyPassIfDue } from "../system/daily-pass";
import { noteCatchUp, runCatchUpIfDue } from "./catch-up";
import {
	readClock,
	readProfile,
	type RequestContext,
	sessionUser,
	withProfile,
} from "./context";
import { type Tx, withUser } from "./with-user";

/** What a server component's read needs before its transaction: the session, then the daily
 * pass when due, then the catch-up check unless the queue holds Subscription items
 * (BR-P2-14, BR-P2-27). `null` when there is no valid session. */
export async function prepareRead(
	requestHeaders: Headers,
): Promise<RequestContext | null> {
	const now = readClock();
	const user = await sessionUser(requestHeaders);
	if (!user) return null;
	const { pricesUpdated } = await runDailyPassIfDue(now);
	if (!queuePending(requestHeaders)) await runCatchUpIfDue(user, now);
	return {
		requestId: requestIdOf(requestHeaders),
		user,
		profile: null,
		now,
		today: null,
		pricesUpdated,
	};
}

/** Runs `fn` in one read transaction as `base.user`, with the profile read inside it
 * (BR-P2-10). */
export async function readWith<T>(
	base: RequestContext,
	fn: (ctx: RequestContext, tx: Tx) => Promise<T>,
): Promise<T> {
	return withUser(base, "read", async (tx) => {
		const profile = await readProfile(tx);
		if (profile) noteCatchUp(base.user.id, profile);
		return fn(withProfile(base, profile), tx);
	});
}

/** Where a page with no valid session goes: `/api/session/expired`, which clears the cookies
 * and opens login (BR-P2-39, flow 7.5), with the page's path as `next`, which `proxy.ts` puts on every page request. */
export function expiredPath(requestHeaders: Headers): string {
	const path = requestHeaders.get(PATH_HEADER);
	return path ?
			`/api/session/expired?${new URLSearchParams({ next: path })}`
		:	"/api/session/expired";
}

// Once per rendered request, however many prefetched queries a page reads (BR-P2-14).
const prepareOnce = cache(async () => prepareRead(await headers()));

/** For server components (BR-P2-10): the request context plus one read transaction. A page
 * may call it once per prefetched query; the session, daily pass and catch-up run once per
 * request. With no valid session, it redirects through `/api/session/expired`. A profile is
 * not required here: the page decides what to show without one. */
export async function readAsUser<T>(
	fn: (ctx: RequestContext, tx: Tx) => Promise<T>,
): Promise<T> {
	const base = await prepareOnce();
	if (!base) redirect(expiredPath(await headers()));
	return readWith(base, fn);
}
