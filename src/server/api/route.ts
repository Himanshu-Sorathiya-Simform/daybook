import "server-only";
import type { z } from "zod";
import { runCatchUpIfDue, noteCatchUp } from "../dal/catch-up";
import {
	readClock,
	readProfile,
	type RequestContext,
	sessionUser,
	withProfile,
} from "../dal/context";
import { type Tx, withUser } from "../dal/with-user";
import { serverEnv } from "../env";
import { runDailyPassIfDue } from "../system/daily-pass";
import {
	checkOrigin,
	isJsonMediaType,
	isMutation,
	isUuidV7,
	parseIfMatch,
	queuePending,
	readBody,
	requestIdOf,
} from "./checks";
import { ApiError, describeError, fromZodError, toApiError } from "./errors";
import {
	claimKey,
	findAnswer,
	storeAnswer,
	type StoredAnswer,
} from "../dal/idempotency";
import { requestHash } from "./request-hash";
import { respond, respondError, successOf } from "./respond";
import { Timing } from "./timing";

export { reply } from "./respond";

/** A route's declaration (BR-P2-15). The `webhook` mode, `stream` and `afterCommit` arrive
 * with F12, F11 and F13, and `capability` with P4 (D-435). */
export type RouteOptions<S extends z.ZodType | undefined> = {
	/** The body's Zod schema, for a mutation. Without one, the parsed JSON is passed on. */
	body?: S;
	/** Whether the route needs a profile (BR-P2-13). Default true. */
	profile?: boolean;
	/** PATCH and DELETE on updatable rows: `If-Match` is required (BR-P2-21). Default false. */
	versioned?: boolean;
	/** Whether a mutation needs an `Idempotency-Key` (BR-P2-16). Default true. */
	idempotent?: boolean;
	/** Whether the catch-up check runs first (BR-P2-14). Default: whether a profile is needed. */
	catchUp?: boolean;
};

/** What a handler receives besides the context and the transaction (D-438). */
export type RouteInput<B> = {
	body: B;
	query: URLSearchParams;
	params: Record<string, string | string[] | undefined>;
	/** The `If-Match` version on a versioned route; `null` otherwise. */
	version: number | null;
};

export type RouteHandler<B> = (
	ctx: RequestContext,
	tx: Tx,
	input: RouteInput<B>,
) => Promise<unknown>;

type BodyOf<S> = S extends z.ZodType ? z.output<S> : unknown;

/** What Next passes a route handler beside the request. */
type NextRouteContext = {
	params?: Promise<Record<string, string | string[] | undefined>>;
};

type Parsed = { ok: true; value: unknown } | { ok: false };

function parseJson(text: string): Parsed {
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false };
	}
}

/** Declares a `user` route handler (BR-P2-15). It runs P2's steps in order, and the first
 * failure answers (BR-P2-17):
 *
 * 1. request id; and, for a mutation:
 * 2. `Content-Type` is JSON (415);
 * 3. body at most 64 KB (413);
 * 4. `Origin` is `APP_ORIGIN` (403);
 * 5. unless exempt, an `Idempotency-Key` that is a UUIDv7 (400), and any `Daybook-Build`
 *    equal to `BUILD_ID` (409 `build_mismatch`, D-383);
 * 6. `If-Match` on a versioned route (400);
 * 8. a session (401);
 * 9. the daily pass when due, then the catch-up check (failures are only logged);
 * 10. one `withUser` transaction, read or write; a stored idempotent answer returns here
 *    (BR-P2-18);
 * 11. the profile, unless the route opts out (403 `profile_required`);
 * 13. the body against its schema (400 for malformed JSON, 422 for invalid fields);
 * 14. the idempotency record is claimed; a key already stored answers from it;
 * 15. the handler, whose answer is stored with the record and sent as `{ "data": ... }`.
 *
 * Steps 7 (webhooks) and 12 (capabilities) arrive with F12 and P4. Every answer carries
 * `x-request-id` and `Server-Timing` (API-8). An error becomes the envelope (BR-P2-24); an
 * unexpected one, or a security event, is logged with the request id and no request data. */
export function route<S extends z.ZodType | undefined = undefined>(
	options: RouteOptions<S>,
	handler: RouteHandler<BodyOf<S>>,
): (request: Request, context?: NextRouteContext) => Promise<Response> {
	const profileRequired = options.profile ?? true;
	const catchUp = options.catchUp ?? profileRequired;

	return async (request, context) => {
		const timing = new Timing();
		const requestId = requestIdOf(request.headers);
		const meta = { requestId, timing };
		const now = readClock();
		const method = request.method.toUpperCase();
		const mutation = isMutation(method);
		const idempotent = mutation && (options.idempotent ?? true);
		try {
			const env = serverEnv();
			const url = new URL(request.url);
			let parsed: Parsed = { ok: true, value: {} };
			let key: string | null = null;
			let version: number | null = null;
			if (mutation) {
				if (!isJsonMediaType(request.headers.get("content-type"))) {
					throw new ApiError("unsupported_media_type");
				}
				const text = await readBody(request);
				checkOrigin(request, env.APP_ORIGIN);
				if (idempotent) {
					const given = request.headers.get("idempotency-key");
					if (!isUuidV7(given)) throw new ApiError("bad_request");
					key = given.toLowerCase();
					const build = request.headers.get("daybook-build");
					if (build !== null && build !== env.BUILD_ID) {
						throw new ApiError("build_mismatch", {
							details: { buildId: env.BUILD_ID },
						});
					}
				}
				if (options.versioned) {
					version = parseIfMatch(request.headers.get("if-match"));
					if (version === null) throw new ApiError("bad_request");
				}
				parsed = parseJson(text);
			}

			const user = await sessionUser(request.headers);
			if (!user) throw new ApiError("unauthenticated");

			const { pricesUpdated } = await runDailyPassIfDue(now, { timing });
			if (catchUp && !queuePending(request.headers)) {
				await runCatchUpIfDue(user, now, { timing });
			}

			// Computed once, before the transaction, from the body as sent (BR-P2-18). A body that
			// is not JSON has no hash; it fails at step 13 before any record is touched.
			const hash =
				idempotent && parsed.ok ?
					requestHash(method, url, parsed.value)
				:	null;
			const params = (await context?.params) ?? {};
			const base: RequestContext = {
				requestId,
				user,
				profile: null,
				now,
				today: null,
				pricesUpdated,
			};

			const answer = await withUser(
				base,
				mutation ? "write" : "read",
				async (tx): Promise<StoredAnswer> => {
					if (key && hash) {
						const stored = await findAnswer(tx, key, hash);
						if (stored) return stored;
					}

					const profile = await readProfile(tx);
					if (profile) noteCatchUp(user.id, profile);
					if (profileRequired && !profile)
						throw new ApiError("profile_required");
					const ctx = withProfile(base, profile);

					let body: unknown = {};
					if (mutation) {
						if (!parsed.ok) throw new ApiError("bad_request");
						if (options.body) {
							const result = options.body.safeParse(parsed.value);
							if (!result.success) throw fromZodError(result.error);
							body = result.data;
						} else {
							body = parsed.value;
						}
					}

					let recordId: string | null = null;
					if (key && hash) {
						recordId = await claimKey(tx, {
							userId: user.id,
							key,
							hash,
							now,
						});
						if (!recordId) {
							const stored = await findAnswer(tx, key, hash);
							if (!stored) throw new ApiError("internal");
							return stored;
						}
					}

					const result = await handler(ctx, tx, {
						body: body as BodyOf<S>,
						query: url.searchParams,
						params,
						version,
					});
					const success = successOf(result);
					if (recordId) {
						return {
							status: success.status,
							body: await storeAnswer(tx, recordId, success, now),
						};
					}
					return success;
				},
				{ timing },
			);
			return respond(answer.status, answer.body, meta);
		} catch (error) {
			const apiError = toApiError(error);
			if (apiError.code === "internal" || apiError.securityEvent) {
				console.error(
					apiError.securityEvent ?
						"[api] Security event"
					:	"[api] Request failed",
					{ requestId, code: apiError.code, ...describeError(error) },
				);
			}
			return respondError(apiError, meta, { read: !mutation });
		}
	};
}
