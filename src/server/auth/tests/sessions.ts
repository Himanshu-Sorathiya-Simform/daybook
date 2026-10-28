import { randomBytes, randomUUIDv7 } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import type { ClientBase } from "pg";
import { createUser, GOLDEN_NOW } from "../../db/tests/private-rows";
import { serverEnv } from "../../env";

/** Far enough ahead that no frozen test clock reaches it. */
const EXPIRES = "2030-01-01T00:00:00.000Z";

/** A session row for `userId`, inserted as the owner, and the `Cookie` header that carries it,
 * signed with the app's secret exactly as Better Auth signs it. Faster than a sign-up, which
 * hashes a password; the auth suite covers sign-up itself. */
export async function sessionFor(
	owner: ClientBase,
	userId: string,
): Promise<string> {
	const token = randomBytes(24).toString("base64url");
	await owner.query(
		`INSERT INTO auth.session (id, expires_at, token, user_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $5)`,
		[randomUUIDv7(), EXPIRES, token, userId, GOLDEN_NOW],
	);
	const signature = await makeSignature(token, serverEnv().BETTER_AUTH_SECRET);
	return `daybook.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

/** A new user with a session: its id and its cookie. */
export async function signedInUser(
	owner: ClientBase,
	label: string,
): Promise<{ id: string; cookie: string }> {
	const id = await createUser(owner, label);
	return { id, cookie: await sessionFor(owner, id) };
}
