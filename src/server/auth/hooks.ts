import "server-only";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { AUTH_PATHS } from "./allow-list";
import { checkBreach } from "./breach";
import { MAX_EMAIL, isBody, normalizeEmail, normalizeName, refuse } from "./rules";

type Body = Record<string, unknown>;

/** Better Auth's own password lengths (D-148). A password outside them is refused by Better
 * Auth after this hook, so it is never sent to the breach check. Better Auth counts UTF-16
 * code units, and so does this. */
const PASSWORD_LENGTH = { min: 12, max: 128 } as const;

/** Refuses a password found in a breach (BR-F01-03). When the check cannot answer, the
 * password is allowed and a warning is logged with the reason only (D-188). */
async function refuseBreached(password: unknown): Promise<void> {
	if (typeof password !== "string") return;
	if (
		password.length < PASSWORD_LENGTH.min
		|| password.length > PASSWORD_LENGTH.max
	) {
		return;
	}
	const check = await checkBreach(password);
	if (check.outcome === "breached") throw refuse("PASSWORD_BREACHED");
	if (check.outcome === "unavailable") {
		const { reason, status } = check;
		console.warn(
			"[auth] Breached-password check unavailable",
			status === undefined ? { reason } : { reason, status },
		);
	}
}

/** `body` with its email trimmed and lowercased, when it has one (BR-F01-01). */
function withEmail(body: Body): Body {
	return typeof body["email"] === "string" ?
			{ ...body, email: normalizeEmail(body["email"]) }
		:	body;
}

/** `body` with its name normalized, or `INVALID_NAME` (BR-F01-01). */
function withName(body: Body): Body {
	const name = normalizeName(body["name"]);
	if (name === null) throw refuse("INVALID_NAME");
	return { ...body, name };
}

/** F01's checks per endpoint, in order: the cheap field checks first, the breach check, which
 * calls out to the network, last. Each returns the body Better Auth then sees. */
const RULES: Partial<Record<string, (body: Body) => Promise<Body> | Body>> = {
	"/sign-up/email": async (body) => {
		const normalized = withEmail(body);
		const email = normalized["email"];
		if (typeof email === "string" && email.length > MAX_EMAIL) {
			throw refuse("INVALID_EMAIL");
		}
		const next = withName(normalized);
		await refuseBreached(next["password"]);
		return next;
	},
	"/sign-in/email": withEmail,
	"/change-password": async (body) => {
		await refuseBreached(body["newPassword"]);
		return body;
	},
	// BR-F01-02: only the display name may change here.
	"/update-user": (body) => {
		if (Object.keys(body).some((key) => key !== "name")) {
			throw refuse("FIELD_NOT_ALLOWED");
		}
		return "name" in body ? withName(body) : body;
	},
};

/**
 * The checks Better Auth's `before` hook runs for `path` and `body` (F01, section 4):
 *
 * 1. **Allow-list** (BR-P2-40, D-202): every endpoint outside `AUTH_PATHS` answers 404, as if
 *    it did not exist, over HTTP and through `auth.api`.
 * 2. **F01's rules** for the endpoint (`RULES`). The body Better Auth validates is the one they
 *    return, so the email it stores is already trimmed and lowercased. A body that is not a
 *    JSON object skips them; Better Auth's own validation refuses it.
 *
 * Returns the hook's answer: `{ context: { body } }`, which Better Auth merges over the request,
 * or nothing when the endpoint has no rules.
 */
export async function applyRules(
	path: string,
	body: unknown,
): Promise<{ context: { body: Body } } | undefined> {
	if (!AUTH_PATHS.has(path)) throw new APIError("NOT_FOUND");
	const rule = RULES[path];
	if (!rule || !isBody(body)) return undefined;
	return { context: { body: await rule(body) } };
}

/** Better Auth's `before` hook. `ctx.path` is the endpoint's declared path, never the raw URL,
 * so a trailing slash or an encoded character cannot slip past the allow-list. */
export const beforeHook = createAuthMiddleware((ctx) =>
	applyRules(ctx.path, ctx.body),
);
