// @vitest-environment node
import { inspect } from "node:util";
import type { BetterAuthOptions } from "better-auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, test, vi } from "vitest";
import { type AuthDatabase, createAuth, handleAuthRequest } from "../auth";

const SECRET = "unit-test-secret-that-is-long-enough-0123456789";

// Nothing listens on port 1, so any query fails at once; building the instance and reading its
// settings never connects.
const pool = new Pool({ connectionString: "postgresql://nobody@127.0.0.1:1/none" });
const db = drizzle({ client: pool }) as unknown as AuthDatabase;

afterAll(() => pool.end());

const contextFor = (origin: string) =>
	createAuth({ APP_ORIGIN: origin, BETTER_AUTH_SECRET: SECRET }, db).$context;

describe("settings", async () => {
	const context = await contextFor("http://localhost:3000");
	// Widened to every option, to check the ones Daybook leaves unset.
	const options: BetterAuthOptions = context.options;

	test("APP_ORIGIN is the base URL and the only trusted origin", () => {
		expect(context.baseURL).toBe("http://localhost:3000/api/auth");
		expect(new Set(context.trustedOrigins)).toEqual(
			new Set(["http://localhost:3000"]),
		);
	});

	test("uses the secret it is given", () => {
		expect(context.secret).toBe(SECRET);
	});

	test("keeps origin and CSRF checks on, even though tests run with NODE_ENV=test", () => {
		expect(process.env["NODE_ENV"]).toBe("test");
		expect(context.skipOriginCheck).toBe(false);
		expect(context.skipCSRFCheck).toBe(false);
	});

	test("allows passwords of 12 to 128 characters", () => {
		expect(context.password.config).toEqual({
			minPasswordLength: 12,
			maxPasswordLength: 128,
		});
	});

	test("sessions last 7 days and are extended once a day", () => {
		expect(context.sessionConfig.expiresIn).toBe(7 * 24 * 60 * 60);
		expect(context.sessionConfig.updateAge).toBe(24 * 60 * 60);
	});

	test("keeps sessions in the database only, with no cookie cache", () => {
		expect(options.session?.cookieCache).toBeUndefined();
	});

	test.each(["user", "session", "account", "verification"] as const)(
		"gives a new %s row a UUIDv7 id",
		(model) => {
			const ids = [
				context.generateId({ model }),
				context.generateId({ model }),
			];
			for (const id of ids) {
				expect(id).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
				);
			}
			expect(ids[0]).not.toBe(ids[1]);
		},
	);

	test("keeps the rate limiter at its defaults", () => {
		expect(options.rateLimit).toBeUndefined();
		expect(context.rateLimit.window).toBe(10);
		expect(context.rateLimit.max).toBe(100);
	});

	test("sends no telemetry", () => {
		expect(options.telemetry?.enabled).toBe(false);
	});
});

describe("the session cookie", () => {
	test("over http is daybook.session_token, HttpOnly, SameSite=Lax, path / and not Secure", async () => {
		const { name, attributes } = (await contextFor("http://localhost:3000"))
			.authCookies.sessionToken;
		expect(name).toBe("daybook.session_token");
		expect(attributes).toMatchObject({
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			secure: false,
		});
	});

	test("over https gets the __Secure- prefix and Secure", async () => {
		const { name, attributes } = (await contextFor("https://daybook.example"))
			.authCookies.sessionToken;
		expect(name).toBe("__Secure-daybook.session_token");
		expect(attributes).toMatchObject({
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			secure: true,
		});
	});
});

describe("handleAuthRequest", () => {
	test("turns an error Better Auth throws into a plain 500 and logs only its name", async () => {
		const auth = createAuth(
			{ APP_ORIGIN: "http://localhost:3000", BETTER_AUTH_SECRET: SECRET },
			db,
		);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await handleAuthRequest(
				new Request("http://localhost:3000/api/auth/sign-in/email", {
					method: "POST",
					headers: {
						origin: "http://localhost:3000",
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email: "secret-person@example.com",
						password: "secret-password-value",
					}),
				}),
				auth,
			);
			expect(response.status).toBe(500);
			expect(await response.text()).toBe("");
			// inspect prints an error's message and cause, which JSON.stringify would drop.
			const written = inspect(error.mock.calls, { depth: 10 });
			expect(written).not.toContain("secret-person");
			expect(written).not.toContain("secret-password-value");
			expect(error.mock.calls.at(-1)?.[0]).toBe("[auth] Request failed");
		} finally {
			error.mockRestore();
		}
	});
});
