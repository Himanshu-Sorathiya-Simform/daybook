import { randomUUIDv7 } from "node:crypto";
import type { Client } from "pg";
import { afterEach, beforeEach, expect, vi } from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../seed/load-golden";
import { signedInUser } from "../../auth/__tests__/sessions";
import { serverEnv } from "../../env";
import type { Answer } from "./call";

export { closeOwner, connectOwner } from "../../db/__tests__/owner";

/** The pieces the endpoint integration tests share: the owner connection and its cleanup, the
 * golden clock, the users they sign in, and the readers of an answer's body. */

/** A signed-in user: the id and the session cookie. */
export type SignedIn = { id: string; cookie: string };

/** A signed-in user with the golden dataset loaded. */
export type GoldenSignedIn = LoadedGolden & { cookie: string };

/** What a write sends besides its body: the `id` it targets, the `If-Match` version, the
 * session, an idempotency key, and extra headers (`null` removes one). */
export type WriteOptions = {
	id?: string;
	version?: string | null;
	cookie?: string | null;
	key?: string;
	headers?: Record<string, string | null>;
};

type ErrorBody = {
	error: {
		code: string;
		fields: Record<string, string>;
		details: Record<string, unknown>;
	};
};

/** The `error` of a refused answer's body. */
export const errorOf = (body: unknown) => (body as ErrorBody).error;

/** The `data` of an answer's body. */
export const dataOf = <T = Record<string, unknown>>(body: unknown) =>
	(body as { data: T }).data;

/** Freezes `Date` at the golden clock for every test of the file, as every endpoint test runs
 * at it. */
export function freezeGoldenClock(): void {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
	});
	afterEach(() => {
		vi.useRealTimers();
	});
}

/** A signed-in user with the golden dataset, added to `users` for the file's cleanup. */
export async function goldenSignedIn(
	owner: Client,
	users: string[],
	label: string,
): Promise<GoldenSignedIn> {
	const user = await signedInUser(owner, label);
	users.push(user.id);
	return { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
}

/** A write as a test sends it: the body and the session, with extra headers (`null` removes
 * one). */
type Write = (
	input: unknown,
	options: { cookie: string | null; headers?: Record<string, string | null> },
) => Promise<Answer>;

/** The same write sent twice with one idempotency key: both answers. */
export async function sentTwiceWithOneKey(
	send: Write,
	input: unknown,
	cookie: string,
) {
	const headers = { "idempotency-key": randomUUIDv7() };
	const first = await send(input, { cookie, headers });
	const again = await send(input, { cookie, headers });
	return { first, again };
}

/** A write with no session is 401, and one with a session but no profile is 403
 * `profile_required`. */
export async function expectSessionRefusals(
	send: Write,
	input: unknown,
	noProfileCookie: string,
) {
	expect((await send(input, { cookie: null })).status).toBe(401);
	const { status, body } = await send(input, { cookie: noProfileCookie });
	expect(status).toBe(403);
	expect(errorOf(body).code).toBe("profile_required");
}

const FOREIGN_ORIGIN = "https://evil.example";

/** A write from another origin is 403 `cross_origin`, and that origin is not the app's. */
export async function expectCrossOriginRefused(
	send: Write,
	input: unknown,
	cookie: string,
) {
	const { status, body } = await send(input, {
		cookie,
		headers: { origin: FOREIGN_ORIGIN },
	});
	expect(status).toBe(403);
	expect(errorOf(body).code).toBe("cross_origin");
	expect(serverEnv().APP_ORIGIN).not.toBe(FOREIGN_ORIGIN);
}

/** The users of a route test file: a golden user, another golden user, and one signed in with
 * no profile. Their ids are added to `users` for the file's cleanup. The label names them,
 * with `-other` and `-new` after it. */
export async function routeUsers(owner: Client, users: string[], label: string) {
	const golden = await goldenSignedIn(owner, users, label);
	const other = await goldenSignedIn(owner, users, `${label}-other`);
	const noProfile = await signedInUser(owner, `${label}-new`);
	users.push(noProfile.id);
	return { golden, other, noProfile };
}
