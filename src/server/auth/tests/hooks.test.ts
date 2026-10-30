// @vitest-environment node
import { isAPIError } from "better-auth/api";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { AUTH_PATHS } from "../allow-list";
import { RANGE_URL } from "../breach";
import { applyRules } from "../hooks";
import { AUTH_REFUSALS, type AuthRefusal } from "../rules";
import { breachedRange, cleanRange, failingRange, rangeAnswer } from "./pwned";

const network = setupServer(cleanRange);
let rangeRequests = 0;

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
	rangeRequests = 0;
	network.events.on("request:start", ({ request }) => {
		if (request.url.startsWith(RANGE_URL)) rangeRequests += 1;
	});
});
afterEach(() => {
	network.resetHandlers();
	network.events.removeAllListeners();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const PASSWORD = "a long enough password";
const SIGN_UP = { email: "asha@example.com", password: PASSWORD, name: "Asha" };

/** The error `run` throws, which must be one of Better Auth's. */
async function refusal(run: Promise<unknown>) {
	const error = await run.then(
		() => {
			throw new Error("Expected a refusal, but the request went through");
		},
		(caught: unknown) => caught,
	);
	if (!isAPIError(error)) throw error;
	return error;
}

async function expectRefusal(run: Promise<unknown>, code: AuthRefusal) {
	const error = await refusal(run);
	expect(error.statusCode).toBe(400);
	expect(error.body).toEqual({ code, message: AUTH_REFUSALS[code] });
}

/** The body Better Auth sees after the hook. */
async function bodyAfter(path: string, body: unknown) {
	const result = await applyRules(path, body);
	return result?.context.body;
}

describe("allow-list (BR-P2-40)", () => {
	test.each([
		"/change-email",
		"/request-password-reset",
		"/reset-password",
		"/sign-in/social",
		"/sign-up/email/",
		"/SIGN-UP/EMAIL",
		"",
		"/",
	])("refuses %j with 404", async (path) => {
		const error = await refusal(applyRules(path, SIGN_UP));
		expect(error.statusCode).toBe(404);
		expect(rangeRequests).toBe(0);
	});

	test.each([
		"/sign-out",
		"/get-session",
		"/list-sessions",
		"/revoke-session",
		"/revoke-other-sessions",
		"/delete-user",
	])("lets %s through unchanged, since F01 has no rule for it", async (path) => {
		expect(AUTH_PATHS.has(path)).toBe(true);
		expect(
			await applyRules(path, { token: "t", password: PASSWORD }),
		).toBeUndefined();
		expect(rangeRequests).toBe(0);
	});
});

describe("a body that is not a JSON object", () => {
	test.each([
		"/sign-up/email",
		"/sign-in/email",
		"/change-password",
		"/update-user",
	])("skips %s's rules, for Better Auth's validation to refuse", async (path) => {
		for (const body of [undefined, null, "body", 7, [], [SIGN_UP]]) {
			expect(await applyRules(path, body)).toBeUndefined();
		}
		expect(rangeRequests).toBe(0);
	});
});

describe("sign-up (BR-F01-01, BR-F01-03)", () => {
	test("passes a valid body through with the email and name normalized", async () => {
		const body = await bodyAfter("/sign-up/email", {
			email: "  Asha@Example.COM ",
			password: PASSWORD,
			name: "  René ",
		});
		expect(body).toEqual({
			email: "asha@example.com",
			password: PASSWORD,
			name: "René",
		});
	});

	test("keeps the password exactly as typed, spaces included", async () => {
		const password = `  ${PASSWORD}  `;
		const body = await bodyAfter("/sign-up/email", { ...SIGN_UP, password });
		expect(body?.["password"]).toBe(password);
	});

	test("keeps other fields for Better Auth to judge", async () => {
		const body = await bodyAfter("/sign-up/email", {
			...SIGN_UP,
			callbackURL: "/x",
			rememberMe: false,
		});
		expect(body).toMatchObject({ callbackURL: "/x", rememberMe: false });
	});

	test("does not change the object it was given", async () => {
		const original = { ...SIGN_UP, email: " A@B.CO " };
		await applyRules("/sign-up/email", original);
		expect(original.email).toBe(" A@B.CO ");
	});

	test("accepts an email of exactly 254 characters", async () => {
		const email = `${"a".repeat(254 - "@example.com".length)}@example.com`;
		expect(email).toHaveLength(254);
		expect(
			(await bodyAfter("/sign-up/email", { ...SIGN_UP, email }))?.["email"],
		).toBe(email);
	});

	test("refuses an email of 255 characters with INVALID_EMAIL", async () => {
		const email = `${"a".repeat(255 - "@example.com".length)}@example.com`;
		await expectRefusal(
			applyRules("/sign-up/email", { ...SIGN_UP, email }),
			"INVALID_EMAIL",
		);
	});

	test("measures the email after trimming", async () => {
		const email = `${"a".repeat(254 - "@example.com".length)}@example.com`;
		const body = await bodyAfter("/sign-up/email", {
			...SIGN_UP,
			email: `  ${email}  `,
		});
		expect(body?.["email"]).toBe(email);
	});

	test("leaves an email that is not a string to Better Auth", async () => {
		const body = await bodyAfter("/sign-up/email", { ...SIGN_UP, email: 42 });
		expect(body?.["email"]).toBe(42);
	});

	test.each([
		["missing", undefined],
		["empty", ""],
		["blank", "   "],
		["51 characters", "a".repeat(51)],
		["a control character", "As\u0000ha"],
		["not a string", 42],
		["null", null],
	])("refuses a name that is %s with INVALID_NAME", async (_, name) => {
		await expectRefusal(
			applyRules("/sign-up/email", { ...SIGN_UP, name }),
			"INVALID_NAME",
		);
	});

	test("checks the email before the name", async () => {
		const email = `${"a".repeat(300)}@example.com`;
		await expectRefusal(
			applyRules("/sign-up/email", { ...SIGN_UP, email, name: "" }),
			"INVALID_EMAIL",
		);
	});

	test("checks the fields before calling the breach service", async () => {
		network.use(breachedRange(PASSWORD));
		await expectRefusal(
			applyRules("/sign-up/email", { ...SIGN_UP, name: "" }),
			"INVALID_NAME",
		);
		expect(rangeRequests).toBe(0);
	});

	test("refuses a breached password with PASSWORD_BREACHED", async () => {
		network.use(breachedRange(PASSWORD));
		await expectRefusal(
			applyRules("/sign-up/email", SIGN_UP),
			"PASSWORD_BREACHED",
		);
		expect(rangeRequests).toBe(1);
	});

	test("asks the breach service once for a clean password", async () => {
		await bodyAfter("/sign-up/email", SIGN_UP);
		expect(rangeRequests).toBe(1);
	});
});

describe("which passwords are sent to the breach check", () => {
	test.each([
		["11 characters", "a".repeat(11), 0],
		["12 characters", "a".repeat(12), 1],
		["128 characters", "a".repeat(128), 1],
		["129 characters", "a".repeat(129), 0],
		// Better Auth counts UTF-16 units: 6 emoji are 12, so this one reaches its limit.
		["6 emoji (12 UTF-16 units)", "😀".repeat(6), 1],
		["5 emoji and a letter (11 units)", `${"😀".repeat(5)}a`, 0],
		["empty", "", 0],
		["not a string", 123_456_789_012, 0],
		["missing", undefined, 0],
	])("a password of %s is checked %i times", async (_, password, times) => {
		await applyRules("/sign-up/email", { ...SIGN_UP, password });
		expect(rangeRequests).toBe(times);
	});
});

describe("when the breach check cannot answer (D-188)", () => {
	test.each([
		["a network error", failingRange, { reason: "network" }],
		["a 503", rangeAnswer("busy", 503), { reason: "status", status: 503 }],
		["a malformed answer", rangeAnswer("<html>"), { reason: "malformed" }],
	])(
		"after %s, sign-up goes on and a warning names the reason only",
		async (_, handler, logged) => {
			network.use(handler);
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const body = await bodyAfter("/sign-up/email", {
				...SIGN_UP,
				email: "secret.person@example.com",
			});
			expect(body?.["password"]).toBe(PASSWORD);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn).toHaveBeenCalledWith(
				"[auth] Breached-password check unavailable",
				logged,
			);
			const written = JSON.stringify(warn.mock.calls);
			expect(written).not.toContain(PASSWORD);
			expect(written).not.toContain("secret.person");
		},
	);

	test("a clean or breached answer logs nothing", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await applyRules("/sign-up/email", SIGN_UP);
		network.use(breachedRange(PASSWORD));
		await applyRules("/sign-up/email", SIGN_UP).catch(() => {});
		expect(warn).not.toHaveBeenCalled();
	});
});

describe("sign-in (BR-F01-01)", () => {
	test("trims and lowercases the email", async () => {
		const body = await bodyAfter("/sign-in/email", {
			email: "\tAsha@Example.COM ",
			password: PASSWORD,
		});
		expect(body).toEqual({ email: "asha@example.com", password: PASSWORD });
	});

	test("never sends the password to the breach check", async () => {
		network.use(breachedRange(PASSWORD));
		await bodyAfter("/sign-in/email", SIGN_UP);
		expect(rangeRequests).toBe(0);
	});

	test("does not check a name or the email's length", async () => {
		const email = `${"a".repeat(300)}@example.com`;
		const body = await bodyAfter("/sign-in/email", {
			email,
			password: PASSWORD,
			name: "",
		});
		expect(body).toEqual({ email, password: PASSWORD, name: "" });
	});

	test("leaves a body without an email unchanged", async () => {
		expect(await bodyAfter("/sign-in/email", { password: PASSWORD })).toEqual({
			password: PASSWORD,
		});
	});
});

describe("change-password (BR-F01-03)", () => {
	const body = { currentPassword: "the old password", newPassword: PASSWORD };

	test("refuses a breached new password", async () => {
		network.use(breachedRange(PASSWORD));
		await expectRefusal(
			applyRules("/change-password", body),
			"PASSWORD_BREACHED",
		);
	});

	test("checks only the new password", async () => {
		const asked: string[] = [];
		network.use(
			http.get(`${RANGE_URL}:prefix`, ({ params }) => {
				asked.push(String(params["prefix"]));
				return new HttpResponse("");
			}),
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await applyRules("/change-password", body);
		// The SHA-1 of "a long enough password" starts B614E, computed with Python's hashlib.
		expect(asked).toEqual(["B614E"]);
	});

	test("passes a clean change through unchanged", async () => {
		expect(await bodyAfter("/change-password", body)).toEqual(body);
	});
});

describe("update-user (BR-F01-01, BR-F01-02)", () => {
	test("accepts a name alone, normalized", async () => {
		expect(await bodyAfter("/update-user", { name: "  Asha Rao " })).toEqual({
			name: "Asha Rao",
		});
	});

	test("lets an empty body through, for Better Auth to answer", async () => {
		expect(await bodyAfter("/update-user", {})).toEqual({});
	});

	test.each([
		{ image: "https://example.com/a.png" },
		{ email: "new@example.com" },
		{ name: "Asha", image: null },
		{ name: "Asha", emailVerified: true },
		{ name: "Asha", id: "someone-else" },
	])("refuses %j with FIELD_NOT_ALLOWED", async (body) => {
		await expectRefusal(applyRules("/update-user", body), "FIELD_NOT_ALLOWED");
	});

	test("refuses an extra field before judging the name", async () => {
		await expectRefusal(
			applyRules("/update-user", { name: "", image: "x" }),
			"FIELD_NOT_ALLOWED",
		);
	});

	test.each(["", "a".repeat(51), "As ha", null, 5])(
		"refuses the name %j with INVALID_NAME",
		async (name) => {
			await expectRefusal(
				applyRules("/update-user", { name }),
				"INVALID_NAME",
			);
		},
	);
});
