import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { GET, POST } from "../../../../app/api/auth/[...all]/route";
import { authPool } from "../../db/pools";
import { parseOwnerEnv, serverEnv } from "../../env";
import { network } from "../../__tests__/network";
import { AUTH_PATHS } from "../allow-list";
import { createAuth, getAuth, handleAuthRequest } from "../auth";
import { breachedRange, failingRange, hangingRange } from "./pwned";

const ORIGIN = serverEnv().APP_ORIGIN;
const DOMAIN = "auth.integration.test";
const PASSWORD = "correct horse battery";

let owner: Client;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
});

afterAll(async () => {
	// The cascade removes each user's sessions and accounts.
	await owner.query(`DELETE FROM auth."user" WHERE email LIKE '%@' || $1`, [
		DOMAIN,
	]);
	await owner.end();
});

const newEmail = () => `${randomUUID()}@${DOMAIN}`;

function request(
	method: "GET" | "POST",
	path: string,
	{
		body,
		headers = {},
	}: { body?: unknown; headers?: Record<string, string> } = {},
): Request {
	return new Request(`${ORIGIN}/api/auth${path}`, {
		method,
		headers: {
			origin: ORIGIN,
			...(body === undefined ? {} : { "content-type": "application/json" }),
			...headers,
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

async function signUp(email = newEmail(), password = PASSWORD): Promise<Response> {
	return POST(
		request("POST", "/sign-up/email", {
			body: { email, password, name: "Asha" },
		}),
	);
}

/** The `name=value` pair of the session cookie a response sets, for the next request. */
function sessionCookie(response: Response): string {
	const set = response.headers
		.getSetCookie()
		.find((cookie) => cookie.startsWith("daybook.session_token="));
	if (!set) throw new Error("No session cookie was set");
	return set.split(";")[0]!;
}

async function rowsFor(email: string) {
	const { rows } = await owner.query<{
		user_id: string;
		account_id: string;
		session_id: string;
		created_at: Date;
		expires_at: Date;
		provider_id: string;
	}>(
		`SELECT u.id AS user_id, a.id AS account_id, a.provider_id, s.id AS session_id,
			s.created_at, s.expires_at
		FROM auth."user" u
		JOIN auth.account a ON a.user_id = u.id
		JOIN auth.session s ON s.user_id = u.id
		WHERE u.email = $1`,
		[email],
	);
	return rows;
}

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("sign-up", () => {
	test("creates the user, a credential account and a session in schema auth", async () => {
		const email = newEmail();
		const response = await signUp(email);
		expect(response.status).toBe(200);
		const rows = await rowsFor(email);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.provider_id).toBe("credential");
	});

	test("gives every row a UUIDv7 id", async () => {
		const email = newEmail();
		await signUp(email);
		const [row] = await rowsFor(email);
		expect(row!.user_id).toMatch(UUID_V7);
		expect(row!.account_id).toMatch(UUID_V7);
		expect(row!.session_id).toMatch(UUID_V7);
	});

	test("starts a session that lasts 7 days", async () => {
		const email = newEmail();
		await signUp(email);
		const [row] = await rowsFor(email);
		const days =
			(row!.expires_at.getTime() - row!.created_at.getTime()) / 86_400_000;
		expect(days).toBeCloseTo(7, 3);
	});

	// BR-F01-12: no "remember me"; a request for a short session still gets 7 days.
	test("rememberMe false still starts a 7-day session with a lasting cookie", async () => {
		const email = newEmail();
		const response = await POST(
			request("POST", "/sign-up/email", {
				body: { email, password: PASSWORD, name: "Asha", rememberMe: false },
			}),
		);
		expect(response.status).toBe(200);
		const [row] = await rowsFor(email);
		const days =
			(row!.expires_at.getTime() - row!.created_at.getTime()) / 86_400_000;
		expect(days).toBeCloseTo(7, 3);
		expect(response.headers.get("set-cookie")).toMatch(/Max-Age=604800/i);
	});

	test("sets the session cookie with prefix daybook, HttpOnly, SameSite=Lax and path /", async () => {
		const response = await signUp();
		const set = response.headers
			.getSetCookie()
			.find((cookie) => cookie.startsWith("daybook.session_token="));
		expect(set).toBeDefined();
		const attributes = set!.split(";").map((part) => part.trim().toLowerCase());
		expect(attributes).toContain("httponly");
		expect(attributes).toContain("samesite=lax");
		expect(attributes).toContain("path=/");
		// APP_ORIGIN is http in tests, so the cookie is not Secure (BR-P2-39).
		expect(new URL(ORIGIN).protocol).toBe("http:");
		expect(attributes).not.toContain("secure");
	});

	test.each([
		["11 characters", "a".repeat(11), 400],
		["129 characters", "a".repeat(129), 400],
	])("refuses a password of %s", async (_name, password, status) => {
		const email = newEmail();
		const response = await signUp(email, password);
		expect(response.status).toBe(status);
		expect(await rowsFor(email)).toHaveLength(0);
	});

	test.each([
		["12 characters", "a".repeat(12)],
		["128 characters", "a".repeat(128)],
	])("accepts a password of %s", async (_name, password) => {
		expect((await signUp(newEmail(), password)).status).toBe(200);
	});
});

describe("sign-in and the session", () => {
	test("signs in with the right password and sets a session cookie", async () => {
		const email = newEmail();
		await signUp(email);
		const response = await POST(
			request("POST", "/sign-in/email", {
				body: { email, password: PASSWORD },
			}),
		);
		expect(response.status).toBe(200);
		expect(sessionCookie(response)).toMatch(/^daybook\.session_token=./);
	});

	test("refuses a wrong password with 401", async () => {
		const email = newEmail();
		await signUp(email);
		const response = await POST(
			request("POST", "/sign-in/email", {
				body: { email, password: "wrong password here" },
			}),
		);
		expect(response.status).toBe(401);
	});

	test("get-session returns the signed-in user", async () => {
		const email = newEmail();
		const cookie = sessionCookie(await signUp(email));
		const response = await GET(
			request("GET", "/get-session", { headers: { cookie } }),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).user.email).toBe(email);
	});

	test("get-session without a cookie returns no session", async () => {
		const response = await GET(request("GET", "/get-session"));
		expect(response.status).toBe(200);
		expect(await response.json()).toBeNull();
	});

	test("sign-out ends the session", async () => {
		const cookie = sessionCookie(await signUp());
		const out = await POST(
			request("POST", "/sign-out", { headers: { cookie } }),
		);
		expect(out.status).toBe(200);
		const after = await GET(
			request("GET", "/get-session", { headers: { cookie } }),
		);
		expect(await after.json()).toBeNull();
	});
});

describe("origin checks", () => {
	test("refuses a sign-in from another origin with 403", async () => {
		const email = newEmail();
		await signUp(email);
		const response = await POST(
			request("POST", "/sign-in/email", {
				body: { email, password: PASSWORD },
				headers: { origin: "https://evil.example" },
			}),
		);
		expect(response.status).toBe(403);
	});

	test("refuses a cookie-carrying request from another origin with 403", async () => {
		const cookie = sessionCookie(await signUp());
		const response = await POST(
			request("POST", "/sign-out", {
				headers: { cookie, origin: "https://evil.example" },
			}),
		);
		expect(response.status).toBe(403);
	});
});

/** Every endpoint the installed Better Auth has, with a method and a concrete path. */
function endpoints(): { path: string; method: "GET" | "POST" }[] {
	return Object.values(getAuth().api).flatMap((endpoint) => {
		const { path, options } = endpoint as unknown as {
			path?: string;
			options?: { method?: string | string[] };
		};
		if (!path) return [];
		const methods = [options?.method ?? "GET"].flat();
		const method = methods.includes("POST") ? "POST" : "GET";
		return [{ path: path.replace(/:[^/]+/g, "x"), method }];
	});
}

describe("allow-list", () => {
	// AC-P2-19
	test.each(["/change-email", "/request-password-reset"])(
		"%s answers 404",
		async (path) => {
			const response = await POST(request("POST", path, { body: {} }));
			expect(response.status).toBe(404);
		},
	);

	test("finds Better Auth's endpoints to check", () => {
		expect(endpoints().length).toBeGreaterThan(AUTH_PATHS.size + 10);
	});

	// AC-P2-19
	test("every endpoint outside the allow-list answers 404", async () => {
		const outside = endpoints().filter(({ path }) => !AUTH_PATHS.has(path));
		const answers = await Promise.all(
			outside.map(async ({ path, method }) => {
				const handler = method === "POST" ? POST : GET;
				const body = method === "POST" ? {} : undefined;
				const response = await handler(request(method, path, { body }));
				return `${method} ${path} ${response.status}`;
			}),
		);
		expect(answers).toEqual(
			outside.map(({ path, method }) => `${method} ${path} 404`),
		);
	});

	test("every endpoint on the allow-list exists in this Better Auth", () => {
		const paths = new Set(endpoints().map(({ path }) => path));
		expect([...AUTH_PATHS].filter((path) => !paths.has(path))).toEqual([]);
	});

	test("an endpoint outside the allow-list is refused through auth.api too", async () => {
		const cookie = sessionCookie(await signUp());
		await expect(
			getAuth().api.listUserAccounts({ headers: new Headers({ cookie }) }),
		).rejects.toMatchObject({ statusCode: 404 });
	});
});

/** Every console line written while `fn` runs, silenced, as one string to search. */
async function captureConsole(
	fn: () => Promise<void>,
): Promise<{ written: string; errors: unknown[][] }> {
	const spies = (["error", "warn", "log", "info", "debug"] as const).map((level) =>
		vi.spyOn(console, level).mockImplementation(() => {}),
	);
	try {
		await fn();
		return {
			// inspect prints an error's message and cause, which JSON.stringify would drop.
			written: inspect(
				spies.flatMap((spy) => spy.mock.calls),
				{ depth: 10 },
			),
			errors: [...spies[0]!.mock.calls],
		};
	} finally {
		for (const spy of spies) spy.mockRestore();
	}
}

describe("database errors", () => {
	test("one Better Auth catches answers its own error and logs only what failed", async () => {
		// The hook refuses a name Postgres would refuse (a NUL), so a temporary check makes the
		// user insert fail instead.
		const BLOCK = "auth_integration_test_name";
		await owner.query(
			`ALTER TABLE auth."user" ADD CONSTRAINT ${BLOCK} CHECK (name <> 'Secret Name') NOT VALID`,
		);
		const email = newEmail();
		let response: Response | undefined;
		try {
			const { written, errors } = await captureConsole(async () => {
				response = await POST(
					request("POST", "/sign-up/email", {
						body: { email, password: PASSWORD, name: "Secret Name" },
					}),
				);
			});
			expect(response!.status).toBe(422);
			expect(written).not.toContain(email);
			expect(written).not.toContain("Secret");
			expect(written).not.toContain("Failed query");
			expect(errors).toContainEqual([
				"[auth] Failed to create user",
				expect.objectContaining({
					name: "DatabaseError",
					sqlstate: "23514",
				}),
			]);
		} finally {
			await owner.query(
				`ALTER TABLE auth."user" DROP CONSTRAINT IF EXISTS ${BLOCK}`,
			);
		}
	});

	describe("when the account insert fails after the user row is written", () => {
		const BLOCK = "auth_integration_test_block";

		beforeAll(async () => {
			await owner.query(
				`ALTER TABLE auth.account ADD CONSTRAINT ${BLOCK} CHECK (provider_id <> 'credential') NOT VALID`,
			);
		});

		afterAll(async () => {
			await owner.query(
				`ALTER TABLE auth.account DROP CONSTRAINT IF EXISTS ${BLOCK}`,
			);
		});

		test("rolls the whole sign-up back, answers a plain 500 and logs only what failed", async () => {
			const email = newEmail();
			let response: Response | undefined;
			const { written, errors } = await captureConsole(async () => {
				response = await signUp(email);
			});
			expect(response!.status).toBe(500);
			expect(await response!.text()).toBe("");
			const { rows } = await owner.query(
				`SELECT 1 FROM auth."user" WHERE email = $1`,
				[email],
			);
			expect(rows).toHaveLength(0);
			expect(written).not.toContain(email);
			expect(written).not.toContain("Failed query");
			expect(errors).toContainEqual([
				"[auth] Request failed",
				{
					name: "DatabaseError",
					sqlstate: "23514",
					table: "account",
					constraint: BLOCK,
				},
			]);
		});
	});
});

/** The stored user for `email`, or `undefined`. */
async function storedUser(email: string) {
	const { rows } = await owner.query<{ email: string; name: string }>(
		`SELECT email, name FROM auth."user" WHERE email = $1`,
		[email],
	);
	return rows[0];
}

function signIn(
	email: string,
	password = PASSWORD,
	headers: Record<string, string> = {},
) {
	return POST(
		request("POST", "/sign-in/email", { body: { email, password }, headers }),
	);
}

/** A new address whose local part is in mixed case, so lowercasing shows. */
const mixedCaseEmail = () =>
	`Asha.${randomUUID().slice(0, 8)}@Auth.Integration.Test`;

describe("F01's rules through the route (BR-F01-01)", () => {
	test("stores the email trimmed and lowercased", async () => {
		const typed = mixedCaseEmail();
		const response = await signUp(`  ${typed}\t`);
		expect(response.status).toBe(200);
		expect(await storedUser(typed.toLowerCase())).toMatchObject({
			email: typed.toLowerCase(),
		});
		expect(await storedUser(typed)).toBeUndefined();
	});

	test("signs in with the email in any case and with spaces around it", async () => {
		const typed = mixedCaseEmail();
		await signUp(typed);
		for (const email of [
			typed.toLowerCase(),
			typed.toUpperCase(),
			` ${typed} `,
		]) {
			expect((await signIn(email)).status).toBe(200);
		}
	});

	// AC-F01-02
	test("refuses a sign-up whose email differs from an account's only in case", async () => {
		const typed = mixedCaseEmail();
		expect((await signUp(typed.toLowerCase())).status).toBe(200);
		const again = await signUp(typed.toUpperCase());
		expect(again.status).toBe(422);
		expect(await again.json()).toMatchObject({
			code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
		});
		const { rows } = await owner.query(
			`SELECT 1 FROM auth."user" WHERE lower(email) = $1`,
			[typed.toLowerCase()],
		);
		expect(rows).toHaveLength(1);
	});

	test("stores the name trimmed and in NFC", async () => {
		const email = newEmail();
		const response = await POST(
			request("POST", "/sign-up/email", {
				body: { email, password: PASSWORD, name: "  René Rao " },
			}),
		);
		expect(response.status).toBe(200);
		expect((await storedUser(email))?.name).toBe("René Rao");
	});

	test.each([
		["empty", ""],
		["51 characters", "a".repeat(51)],
		["a line break inside", "As\nha"],
		["invisible characters only", "​‍"],
	])(
		"refuses a name that is %s with 400 INVALID_NAME and creates nothing",
		async (_, name) => {
			const email = newEmail();
			const response = await POST(
				request("POST", "/sign-up/email", {
					body: { email, password: PASSWORD, name },
				}),
			);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				code: "INVALID_NAME",
				message: "Enter a name of up to 50 characters.",
			});
			expect(await storedUser(email)).toBeUndefined();
		},
	);

	test("refuses an email over 254 characters with 400 INVALID_EMAIL and creates nothing", async () => {
		const email = `${"a".repeat(255 - DOMAIN.length - 1)}@${DOMAIN}`;
		expect(email).toHaveLength(255);
		const response = await signUp(email);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "INVALID_EMAIL" });
		expect(await storedUser(email)).toBeUndefined();
	});

	test("accepts an email of exactly 254 characters", async () => {
		const email = `${"b".repeat(254 - DOMAIN.length - 1)}@${DOMAIN}`;
		expect(email).toHaveLength(254);
		expect((await signUp(email)).status).toBe(200);
	});
});

describe("the breached-password check through the route (BR-F01-03)", () => {
	// AC-F01-03
	test("refuses a breached password at sign-up with 400 PASSWORD_BREACHED and creates nothing", async () => {
		network.use(breachedRange(PASSWORD));
		const email = newEmail();
		const response = await signUp(email);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			code: "PASSWORD_BREACHED",
			message:
				"This password has appeared in a data breach. Choose a different one.",
		});
		expect(await storedUser(email)).toBeUndefined();
	});

	// AC-F01-03
	test("refuses a breached new password at change-password and keeps the old one", async () => {
		const email = newEmail();
		const cookie = sessionCookie(await signUp(email));
		const breached = "a breached new password";
		network.use(breachedRange(breached));
		const response = await POST(
			request("POST", "/change-password", {
				body: { currentPassword: PASSWORD, newPassword: breached },
				headers: { cookie },
			}),
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "PASSWORD_BREACHED" });
		expect((await signIn(email)).status).toBe(200);
		expect((await signIn(email, breached)).status).toBe(401);
	});

	test("lets a clean new password through at change-password", async () => {
		const email = newEmail();
		const cookie = sessionCookie(await signUp(email));
		const fresh = "a fresh and clean password";
		const response = await POST(
			request("POST", "/change-password", {
				body: { currentPassword: PASSWORD, newPassword: fresh },
				headers: { cookie },
			}),
		);
		expect(response.status).toBe(200);
		expect((await signIn(email, fresh)).status).toBe(200);
	});

	// AC-F01-03
	test("lets sign-up through when the service does not answer in 3 seconds, and warns", async () => {
		network.use(hangingRange);
		const email = newEmail();
		let response: Response | undefined;
		const started = Date.now();
		const { written } = await captureConsole(async () => {
			response = await signUp(email);
		});
		expect(Date.now() - started).toBeGreaterThanOrEqual(3000);
		expect(response!.status).toBe(200);
		expect(await storedUser(email)).toBeDefined();
		expect(written).toContain("[auth] Breached-password check unavailable");
		expect(written).toContain("timeout");
		expect(written).not.toContain(email);
		expect(written).not.toContain(PASSWORD);
	});

	test("lets sign-up through when the service fails, and warns", async () => {
		network.use(failingRange);
		const email = newEmail();
		let response: Response | undefined;
		const { written } = await captureConsole(async () => {
			response = await signUp(email);
		});
		expect(response!.status).toBe(200);
		expect(written).toContain("network");
	});

	test("never checks the password at sign-in", async () => {
		const email = newEmail();
		await signUp(email);
		network.use(breachedRange(PASSWORD));
		expect((await signIn(email)).status).toBe(200);
	});
});

describe("update-user (BR-F01-01, BR-F01-02)", () => {
	function updateUser(cookie: string, body: unknown) {
		return POST(request("POST", "/update-user", { body, headers: { cookie } }));
	}

	test("changes the name, trimmed and in NFC", async () => {
		const email = newEmail();
		const cookie = sessionCookie(await signUp(email));
		expect((await updateUser(cookie, { name: "  René " })).status).toBe(200);
		expect((await storedUser(email))?.name).toBe("René");
	});

	// AC-F01-11
	test.each([
		{ image: "https://example.com/a.png" },
		{ name: "Asha", image: null },
	])("refuses %j with 400 FIELD_NOT_ALLOWED and changes nothing", async (body) => {
		const email = newEmail();
		const cookie = sessionCookie(await signUp(email));
		const response = await updateUser(cookie, body);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
		const { rows } = await owner.query(
			`SELECT name, image FROM auth."user" WHERE email = $1`,
			[email],
		);
		expect(rows[0]).toEqual({ name: "Asha", image: null });
	});

	// AC-F01-11
	test("refuses a 51-character name with 400 INVALID_NAME and keeps the old one", async () => {
		const email = newEmail();
		const cookie = sessionCookie(await signUp(email));
		const response = await updateUser(cookie, { name: "a".repeat(51) });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "INVALID_NAME" });
		expect((await storedUser(email))?.name).toBe("Asha");
	});

	// AC-F01-11
	test("accepts a 50-character name", async () => {
		const email = newEmail();
		const cookie = sessionCookie(await signUp(email));
		expect((await updateUser(cookie, { name: "a".repeat(50) })).status).toBe(
			200,
		);
		expect((await storedUser(email))?.name).toBe("a".repeat(50));
	});

	test("refuses an invalid name with 400 INVALID_NAME and keeps the old one", async () => {
		const email = newEmail();
		const cookie = sessionCookie(await signUp(email));
		const response = await updateUser(cookie, { name: "   " });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "INVALID_NAME" });
		expect((await storedUser(email))?.name).toBe("Asha");
	});
});

describe("sign-in refusals", () => {
	// AC-F01-04
	test("a wrong password and an unknown email answer exactly the same", async () => {
		const email = newEmail();
		await signUp(email);
		const wrongPassword = await signIn(email, "not the right password");
		const unknownEmail = await signIn(newEmail());
		expect(wrongPassword.status).toBe(401);
		expect(unknownEmail.status).toBe(wrongPassword.status);
		expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
		expect(unknownEmail.headers.getSetCookie()).toEqual(
			wrongPassword.headers.getSetCookie(),
		);
	});
});

describe("the rate limiter in the database (BR-F01-08, D-153)", () => {
	// Documentation addresses (RFC 5737), one per test, so no two tests share a count. The
	// table outlives a run, so the rows go before and after.
	const ADDRESSES = Array.from({ length: 12 }, (_, i) => `203.0.113.${i + 1}`);
	const SIGN_IN = "/sign-in/email";

	const clearRows = () =>
		owner.query(
			`DELETE FROM auth.rate_limit WHERE split_part(key, '|', 1) = ANY($1)`,
			[ADDRESSES],
		);

	beforeAll(clearRows);
	afterAll(clearRows);

	/** A Better Auth instance with the limiter on, over its own Drizzle instance, as another
	 * server instance would have. */
	const limitedAuth = () =>
		createAuth(serverEnv(), drizzle({ client: authPool() }), {
			rateLimit: true,
		});

	const attempt = (
		auth: ReturnType<typeof limitedAuth>,
		address: string,
		path = SIGN_IN,
	) =>
		handleAuthRequest(
			request("POST", path, {
				body: { email: newEmail(), password: PASSWORD, name: "Asha" },
				headers: { "x-forwarded-for": address },
			}),
			auth,
		);

	async function statuses(
		auth: ReturnType<typeof limitedAuth>,
		address: string,
		times: number,
	): Promise<number[]> {
		const result = [];
		for (let i = 0; i < times; i += 1)
			result.push((await attempt(auth, address)).status);
		return result;
	}

	async function row(address: string, path = SIGN_IN) {
		const { rows } = await owner.query<{
			id: string;
			count: number;
			last_request: string;
		}>(`SELECT id, count, last_request FROM auth.rate_limit WHERE key = $1`, [
			`${address}|${path}`,
		]);
		return rows[0];
	}

	/** Moves an address's last attempt back by `ms`, rather than waiting. */
	const age = (address: string, ms: number) =>
		owner.query(
			`UPDATE auth.rate_limit SET last_request = last_request - $2 WHERE key = $1`,
			[`${address}|${SIGN_IN}`, ms],
		);

	// AC-F01-05
	test("the fourth sign-in from one address in 10 seconds gets 429", async () => {
		const auth = limitedAuth();
		expect(await statuses(auth, ADDRESSES[0]!, 4)).toEqual([401, 401, 401, 429]);
	});

	test("a 429 says how many seconds to wait, at most the 10-second window", async () => {
		const auth = limitedAuth();
		await statuses(auth, ADDRESSES[1]!, 3);
		const refused = await attempt(auth, ADDRESSES[1]!);
		expect(refused.status).toBe(429);
		const wait = Number(refused.headers.get("x-retry-after"));
		expect(wait).toBeGreaterThanOrEqual(1);
		expect(wait).toBeLessThanOrEqual(10);
	});

	test("keeps one row per address and path: a UUIDv7 id, the count and the last attempt in ms", async () => {
		const before = Date.now();
		await statuses(limitedAuth(), ADDRESSES[2]!, 2);
		const after = Date.now();
		const stored = await row(ADDRESSES[2]!);
		expect(stored?.id).toMatch(UUID_V7);
		expect(stored?.count).toBe(2);
		expect(Number(stored?.last_request)).toBeGreaterThanOrEqual(before);
		expect(Number(stored?.last_request)).toBeLessThanOrEqual(after);
	});

	test("a refused attempt is not counted", async () => {
		const auth = limitedAuth();
		await statuses(auth, ADDRESSES[3]!, 5);
		expect((await row(ADDRESSES[3]!))?.count).toBe(3);
	});

	test("another address has its own count", async () => {
		const auth = limitedAuth();
		await statuses(auth, ADDRESSES[4]!, 4);
		expect((await attempt(auth, ADDRESSES[5]!)).status).toBe(401);
	});

	test("two server instances share one count", async () => {
		const first = limitedAuth();
		const second = limitedAuth();
		expect(await statuses(first, ADDRESSES[6]!, 3)).toEqual([401, 401, 401]);
		expect((await attempt(second, ADDRESSES[6]!)).status).toBe(429);
	});

	test("sign-up keeps its own count, apart from sign-in's", async () => {
		const auth = limitedAuth();
		await statuses(auth, ADDRESSES[7]!, 4);
		const response = await attempt(auth, ADDRESSES[7]!, "/sign-up/email");
		expect(response.status).toBe(200);
		expect((await row(ADDRESSES[7]!, "/sign-up/email"))?.count).toBe(1);
	});

	test("the count starts again once 10 seconds have passed since the last attempt", async () => {
		const auth = limitedAuth();
		await statuses(auth, ADDRESSES[8]!, 4);
		await age(ADDRESSES[8]!, 10_000);
		expect((await attempt(auth, ADDRESSES[8]!)).status).toBe(401);
		expect((await row(ADDRESSES[8]!))?.count).toBe(1);
	});

	// Each attempt takes real time against the database, so this stays well inside the window.
	test("5 seconds after the last attempt, the count still holds", async () => {
		const auth = limitedAuth();
		await statuses(auth, ADDRESSES[9]!, 3);
		await age(ADDRESSES[9]!, 5_000);
		expect((await attempt(auth, ADDRESSES[9]!)).status).toBe(429);
	});

	test("a restarted count deletes rows older than a minute, Better Auth's longest window", async () => {
		const [stale, recent, trigger] = [
			ADDRESSES[10]!,
			ADDRESSES[11]!,
			ADDRESSES[0]!,
		];
		const auth = limitedAuth();
		await clearRows();
		for (const address of [stale, recent, trigger]) await attempt(auth, address);
		await age(stale, 61_000);
		await age(recent, 30_000);
		await age(trigger, 11_000);
		await attempt(auth, trigger);
		expect(await row(stale)).toBeUndefined();
		expect((await row(recent))?.count).toBe(1);
		expect((await row(trigger))?.count).toBe(1);
	});

	test("lets exactly 3 through when 8 attempts from one address arrive together", async () => {
		const auth = limitedAuth();
		const address = ADDRESSES[2]!;
		await clearRows();
		const responses = await Promise.all(
			Array.from({ length: 8 }, () => attempt(auth, address)),
		);
		const codes = responses.map((response) => response.status).sort();
		expect(codes).toEqual([401, 401, 401, 429, 429, 429, 429, 429]);
		expect((await row(address))?.count).toBe(3);
	});
});
