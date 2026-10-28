import "server-only";
import { randomUUIDv7 } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { authPool } from "../db/pools";
import { account, session, user, verification } from "../db/schema/auth";
import { serverEnv, type ServerEnv } from "../env";
import { beforeHook } from "./allow-list";
import { describeError, logAuth } from "./log";

const tables = { user, session, account, verification };

export type AuthDatabase = NodePgDatabase<typeof tables>;

const DAY = 60 * 60 * 24;

/** Builds Daybook's Better Auth instance (BR-P2-40). The app uses `getAuth()`; tests build
 * one directly to check its settings for another origin.
 *
 * - **Database:** its own Drizzle instance over the auth pool, tables in schema `auth`. Each
 *   multi-row write (sign-up's user and account) runs in one transaction, so a failure never
 *   leaves a user without a password.
 * - **Ids:** UUIDv7 for every row (ID-1, D-416).
 * - **Origin:** `APP_ORIGIN` is the base URL and so the only trusted origin. Its `https` turns on
 *   `Secure` cookies with the `__Secure-` prefix (BR-P2-39).
 * - **Origin and CSRF checks stay on in tests too.** Better Auth turns them off by default
 *   when `NODE_ENV` is `test`; tests must see what production does.
 * - **Passwords:** 12 to 128 characters (D-148). **Sessions:** 7 days, extended once a day
 *   while used (D-151). The rate limiter keeps its defaults (D-153).
 * - **Errors:** an unexpected one is thrown out of `handler` rather than logged by Better
 *   Auth, which would print it whole; `handleAuthRequest` logs only `describeError`. */
export function createAuth(
	env: Pick<ServerEnv, "APP_ORIGIN" | "BETTER_AUTH_SECRET">,
	db: AuthDatabase,
) {
	return betterAuth({
		appName: "Daybook",
		// Better Auth trusts the base URL's origin itself, so no other origin is listed.
		baseURL: env.APP_ORIGIN,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: tables,
			transaction: true,
		}),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 12,
			maxPasswordLength: 128,
		},
		session: { expiresIn: 7 * DAY, updateAge: DAY },
		advanced: {
			cookiePrefix: "daybook",
			disableOriginCheck: false,
			disableCSRFCheck: false,
			database: { generateId: () => randomUUIDv7() },
		},
		hooks: { before: beforeHook },
		logger: { log: logAuth },
		onAPIError: { throw: true },
		telemetry: { enabled: false },
	});
}

export type Auth = ReturnType<typeof createAuth>;

// Kept on globalThis so a development hot reload reuses the instance and its pool.
const store = globalThis as typeof globalThis & { __daybookAuth?: Auth };

/** The app's Better Auth instance, built on first use, so importing this module (as
 * `next build` does) needs no environment. */
export function getAuth(): Auth {
	return (store.__daybookAuth ??= createAuth(
		serverEnv(),
		drizzle({ client: authPool(), schema: tables }),
	));
}

/** Answers one request to `/api/auth/*`. Better Auth turns its own errors (a wrong password,
 * a 404 from the allow-list) into responses; anything it throws is unexpected, and becomes a
 * plain 500 with a log line that holds no request data. */
export async function handleAuthRequest(
	request: Request,
	auth: Auth = getAuth(),
): Promise<Response> {
	try {
		return await auth.handler(request);
	} catch (error) {
		console.error("[auth] Request failed", describeError(error));
		return new Response(null, { status: 500 });
	}
}
