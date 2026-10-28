// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import { handleProxy, PATH_HEADER } from "../proxy";

const ORIGIN = "http://localhost:3000";
const OPTIONS = { origin: ORIGIN, development: false };
const SESSION = "daybook.session_token=abc.sig";
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function call(
	path: string,
	{
		method = "GET",
		headers = {},
	}: { method?: string; headers?: Record<string, string> } = {},
	options = OPTIONS,
) {
	return handleProxy(
		new NextRequest(`${ORIGIN}${path}`, { method, headers }),
		options,
	);
}

/** A request header the proxy forwards to the app, as Next.js reads it from the response. */
const forwarded = (response: Response, name: string) =>
	response.headers.get(`x-middleware-request-${name}`);

const location = (response: Response) => response.headers.get("location");

describe("every response", () => {
	test.each(["/", "/dashboard", "/api/transactions", "/login"])(
		"%s gets a new UUIDv7 request id, on the response and the forwarded request",
		(path) => {
			const response = call(path, { headers: { cookie: SESSION } });
			const id = response.headers.get("x-request-id");
			expect(id).toMatch(V7);
			if (!location(response))
				expect(forwarded(response, "x-request-id")).toBe(id);
		},
	);

	test("replaces a request id the client sent (BR-P2-30)", () => {
		const response = call("/", {
			headers: { "x-request-id": "0192f0c4-8a1b-7c2d-9e3f-0123456789ab" },
		});
		expect(response.headers.get("x-request-id")).not.toBe(
			"0192f0c4-8a1b-7c2d-9e3f-0123456789ab",
		);
		expect(forwarded(response, "x-request-id")).toBe(
			response.headers.get("x-request-id"),
		);
	});

	test("gives a different id to each request", () => {
		expect(call("/").headers.get("x-request-id")).not.toBe(
			call("/").headers.get("x-request-id"),
		);
	});

	test.each(["/", "/api/transactions", "/dashboard"])(
		"%s carries the security headers (BR-P2-34)",
		(path) => {
			const response = call(path);
			expect(response.headers.get("x-content-type-options")).toBe("nosniff");
			expect(response.headers.get("referrer-policy")).toBe(
				"strict-origin-when-cross-origin",
			);
			expect(response.headers.get("permissions-policy")).toContain(
				"camera=()",
			);
		},
	);

	test("adds HSTS only over https", () => {
		const https = { origin: "https://daybook.example", development: false };
		expect(
			call("/", {}, https).headers.get("strict-transport-security"),
		).toContain("max-age=");
		expect(call("/").headers.get("strict-transport-security")).toBeNull();
	});
});

describe("pages (BR-P2-32)", () => {
	test("get a CSP with a nonce, on the response and the forwarded request", () => {
		const response = call("/");
		const csp = response.headers.get("content-security-policy");
		const nonce = forwarded(response, "x-nonce");
		expect(nonce).toBeTruthy();
		expect(csp).toContain(`'nonce-${nonce}'`);
		expect(forwarded(response, "content-security-policy")).toBe(csp);
	});

	test("get a fresh nonce each time", () => {
		expect(forwarded(call("/"), "x-nonce")).not.toBe(
			forwarded(call("/"), "x-nonce"),
		);
	});

	test("forward the page's path and query for readAsUser's next (D-440)", () => {
		const response = call("/transactions?month=2026-11", {
			headers: { cookie: SESSION },
		});
		expect(forwarded(response, PATH_HEADER)).toBe("/transactions?month=2026-11");
	});

	test("in development, the CSP allows eval", () => {
		const response = call("/", {}, { origin: ORIGIN, development: true });
		expect(response.headers.get("content-security-policy")).toContain(
			"'unsafe-eval'",
		);
	});
});

describe("API responses", () => {
	test("get no CSP and no nonce", () => {
		const response = call("/api/transactions");
		expect(response.headers.get("content-security-policy")).toBeNull();
		expect(forwarded(response, "x-nonce")).toBeNull();
		expect(forwarded(response, "content-security-policy")).toBeNull();
	});

	test("are never redirected by the session cookie", () => {
		expect(location(call("/api/transactions"))).toBeNull();
	});

	test("are never redirected by the logout marker", () => {
		const response = call("/api/session/expired?reason=logout", {
			headers: { cookie: "daybook_logout=1" },
		});
		expect(location(response)).toBeNull();
	});
});

describe("the early API reject (BR-P2-31)", () => {
	const json = { "content-type": "application/json", origin: ORIGIN };

	test("passes a JSON mutation from the app's origin", () => {
		const response = call("/api/transactions", {
			method: "POST",
			headers: json,
		});
		expect(response.headers.get("x-middleware-next")).toBe("1");
	});

	test.each(["POST", "PUT", "PATCH", "DELETE"])(
		"refuses a %s that is not JSON with 415 and the envelope",
		async (method) => {
			const response = call("/api/transactions", {
				method,
				headers: { "content-type": "text/plain", origin: ORIGIN },
			});
			expect(response.status).toBe(415);
			const body = await response.json();
			expect(body.error.code).toBe("unsupported_media_type");
			expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
		},
	);

	test.each([
		[
			"a foreign Origin",
			{ "content-type": "application/json", origin: "https://evil.example" },
		],
		["no Origin", { "content-type": "application/json" }],
	])("refuses a mutation with %s with 403", async (_name, headers) => {
		const response = call("/api/transactions", { method: "POST", headers });
		expect(response.status).toBe(403);
		expect((await response.json()).error.code).toBe("cross_origin");
	});

	test("checks the media type before the origin, as the wrapper does", async () => {
		const response = call("/api/transactions", {
			method: "POST",
			headers: { "content-type": "text/plain" },
		});
		expect(response.status).toBe(415);
	});

	test("accepts JSON with a charset", () => {
		const response = call("/api/transactions", {
			method: "POST",
			headers: { ...json, "content-type": "application/json; charset=utf-8" },
		});
		expect(response.status).toBe(200);
	});

	test.each(["/api/auth/sign-in/email", "/api/webhooks/stripe"])(
		"leaves %s to its own checks",
		(path) => {
			const response = call(path, {
				method: "POST",
				headers: { "content-type": "text/plain" },
			});
			expect(response.status).toBe(200);
		},
	);

	test("never refuses a read", () => {
		expect(
			call("/api/transactions", { headers: { "content-type": "text/plain" } })
				.status,
		).toBe(200);
	});

	test("an /api look-alike outside /api is a page, not checked", () => {
		const response = call("/apiary", { method: "POST" });
		expect(response.status).toBe(200);
	});
});

describe("redirects (BR-P2-29)", () => {
	test.each([
		"/onboarding",
		"/dashboard",
		"/transactions",
		"/budgets",
		"/subscriptions",
		"/goals",
		"/goals/0192f0c4-8a1b-7c2d-9e3f-0123456789ab",
		"/investments",
		"/analytics",
		"/insights",
		"/reports",
		"/settings/profile",
	])("no session cookie on %s goes to /login with next", (path) => {
		const response = call(path);
		expect(response.status).toBe(307);
		expect(location(response)).toBe(
			`${ORIGIN}/login?${new URLSearchParams({ next: path })}`,
		);
	});

	test("next keeps the query", () => {
		expect(location(call("/transactions?month=2026-11&q=rent"))).toBe(
			`${ORIGIN}/login?next=%2Ftransactions%3Fmonth%3D2026-11%26q%3Drent`,
		);
	});

	test.each([
		"/",
		"/learn",
		"/learn/budgeting",
		"/offline",
		"/print/reports/x",
		"/login",
		"/signup",
		"/dashboards",
	])("no session cookie on %s passes", (path) => {
		expect(location(call(path))).toBeNull();
	});

	test.each(["/dashboard", "/settings/security"])(
		"a session cookie on %s passes",
		(path) => {
			expect(
				location(call(path, { headers: { cookie: SESSION } })),
			).toBeNull();
		},
	);

	test("a __Secure- session cookie counts as a session", () => {
		const response = call("/dashboard", {
			headers: { cookie: "__Secure-daybook.session_token=abc.sig" },
		});
		expect(location(response)).toBeNull();
	});

	test("another app's session cookie does not count", () => {
		const response = call("/dashboard", {
			headers: { cookie: "better-auth.session_token=abc.sig" },
		});
		expect(location(response)).toContain("/login?");
	});

	test.each(["/login", "/signup", "/login?next=%2Fbudgets"])(
		"a session cookie on %s goes to /dashboard",
		(path) => {
			expect(location(call(path, { headers: { cookie: SESSION } }))).toBe(
				`${ORIGIN}/dashboard`,
			);
		},
	);

	test("a session cookie on /login?expired=1 passes, so an expired session never loops", () => {
		expect(
			location(call("/login?expired=1", { headers: { cookie: SESSION } })),
		).toBeNull();
	});

	test("a session cookie on / passes: its page decides", () => {
		expect(location(call("/", { headers: { cookie: SESSION } }))).toBeNull();
	});

	describe("the logout marker (D-367)", () => {
		const marked = `${SESSION}; daybook_logout=1`;

		test.each(["/", "/dashboard", "/learn", "/print/reports/x"])(
			"on %s goes to /api/session/expired?reason=logout",
			(path) => {
				expect(location(call(path, { headers: { cookie: marked } }))).toBe(
					`${ORIGIN}/api/session/expired?reason=logout`,
				);
			},
		);

		test("wins over the login redirect when there is no session cookie", () => {
			expect(
				location(
					call("/dashboard", { headers: { cookie: "daybook_logout=1" } }),
				),
			).toBe(`${ORIGIN}/api/session/expired?reason=logout`);
		});

		test.each(["/login", "/signup", "/offline", "/login?expired=1"])(
			"on %s passes",
			(path) => {
				const response = call(path, {
					headers: { cookie: "daybook_logout=1" },
				});
				expect(location(response)).toBeNull();
			},
		);

		test("another value of the cookie is not the marker", () => {
			expect(
				location(call("/", { headers: { cookie: "daybook_logout=0" } })),
			).toBeNull();
		});
	});

	test("redirects carry the request id and the security headers", () => {
		const response = call("/dashboard");
		expect(response.headers.get("x-request-id")).toMatch(V7);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});

	test("redirects go to APP_ORIGIN, never to the request's host", () => {
		const response = handleProxy(
			new NextRequest("http://internal.host:8080/dashboard"),
			OPTIONS,
		);
		expect(location(response)).toBe(`${ORIGIN}/login?next=%2Fdashboard`);
	});
});
