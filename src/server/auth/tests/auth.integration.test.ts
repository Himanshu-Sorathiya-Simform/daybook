import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { GET, POST } from "../../../../app/api/auth/[...all]/route";
import { parseOwnerEnv, serverEnv } from "../../env";
import { AUTH_PATHS } from "../allow-list";
import { getAuth } from "../auth";

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
		const email = newEmail();
		let response: Response | undefined;
		const { written, errors } = await captureConsole(async () => {
			// Postgres refuses a NUL byte in text, so the user insert fails.
			response = await POST(
				request("POST", "/sign-up/email", {
					body: { email, password: PASSWORD, name: "Secret\u0000Name" },
				}),
			);
		});
		expect(response!.status).toBe(422);
		expect(written).not.toContain(email);
		expect(written).not.toContain("Secret");
		expect(written).not.toContain("Failed query");
		expect(errors).toContainEqual([
			"[auth] Failed to create user",
			expect.objectContaining({ name: "DatabaseError", sqlstate: "22021" }),
		]);
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
