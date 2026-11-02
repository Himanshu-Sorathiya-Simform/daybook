import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { isUuidV7 } from "@/lib/ids";
import { API_TIMEOUT_MS, ApiRequestError, apiFetch } from "../client";
import { type ApiEvent, onApiEvent } from "../events";

const network = setupServer();
const url = (path: string) => new URL(path, window.location.origin).toString();

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.useRealTimers();
});
afterAll(() => network.close());

/** Every event `apiFetch` sends while `run` runs. */
async function eventsDuring(run: () => Promise<unknown>): Promise<ApiEvent[]> {
	const events: ApiEvent[] = [];
	const stop = onApiEvent((event) => events.push(event));
	try {
		await run().catch(() => undefined);
	} finally {
		stop();
	}
	return events;
}

/** The request the handler saw, for checking what was sent. */
function capture(
	path: string,
	method: "get" | "post" | "patch" | "delete",
	answer = {},
) {
	const seen: Request[] = [];
	network.use(
		http[method](url(path), ({ request }) => {
			seen.push(request.clone());
			return HttpResponse.json({ data: answer });
		}),
	);
	return seen;
}

const envelope = (
	code: string,
	status: number,
	more: Record<string, unknown> = {},
) =>
	HttpResponse.json(
		{
			error: {
				code,
				message: `The ${code} message.`,
				requestId: "req-1",
				...more,
			},
		},
		{ status },
	);

async function failure(path: string): Promise<ApiRequestError> {
	try {
		await apiFetch(path);
	} catch (error) {
		if (error instanceof ApiRequestError) return error;
		throw error;
	}
	throw new Error("Expected apiFetch to fail");
}

describe("success (API-11)", () => {
	test("answers the envelope's data", async () => {
		capture("/api/me", "get", { user: { id: "u1" } });
		expect(await apiFetch("/api/me")).toEqual({ user: { id: "u1" } });
	});

	test("answers data that is null, an array or a number as it is", async () => {
		for (const data of [null, [1, 2], 0, false, ""]) {
			network.use(http.get(url("/api/x"), () => HttpResponse.json({ data })));
			expect(await apiFetch("/api/x")).toEqual(data);
		}
	});

	test("answers undefined for a 204", async () => {
		network.use(
			http.delete(
				url("/api/x/1"),
				() => new HttpResponse(null, { status: 204 }),
			),
		);
		expect(await apiFetch("/api/x/1", { method: "DELETE" })).toBeUndefined();
	});

	test("a 2xx without a data envelope is an http error with no code", async () => {
		network.use(
			http.get(url("/api/x"), () =>
				HttpResponse.json(
					{ items: [] },
					{ headers: { "x-request-id": "req-9" } },
				),
			),
		);
		const error = await failure("/api/x");
		expect(error).toMatchObject({
			kind: "http",
			status: 200,
			code: null,
			requestId: "req-9",
		});
	});

	test("a 2xx whose body is not JSON is an http error", async () => {
		network.use(
			http.get(
				url("/api/x"),
				() => new HttpResponse("<html>", { status: 200 }),
			),
		);
		expect(await failure("/api/x")).toMatchObject({ kind: "http", status: 200 });
	});
});

describe("what a read sends", () => {
	test("GET with accept JSON and the page's cookies", async () => {
		const seen = capture("/api/me", "get");
		await apiFetch("/api/me");
		const [request] = seen;
		expect(request!.method).toBe("GET");
		expect(request!.headers.get("accept")).toBe("application/json");
		expect(request!.credentials).toBe("same-origin");
	});

	test("asks the browser not to cache the answer", async () => {
		// MSW rebuilds the request without its cache mode, so read what fetch was given.
		capture("/api/me", "get");
		const spy = vi.spyOn(globalThis, "fetch");
		await apiFetch("/api/me");
		expect(spy.mock.calls[0]![1]).toMatchObject({
			cache: "no-store",
			credentials: "same-origin",
		});
		spy.mockRestore();
	});

	test("no Idempotency-Key, no content type and no body", async () => {
		const seen = capture("/api/me", "get");
		await apiFetch("/api/me");
		expect(seen[0]!.headers.get("idempotency-key")).toBeNull();
		expect(seen[0]!.headers.get("content-type")).toBeNull();
		expect(seen[0]!.body).toBeNull();
	});

	test("keeps the query string", async () => {
		const seen: string[] = [];
		network.use(
			http.get(url("/api/transactions"), ({ request }) => {
				seen.push(new URL(request.url).search);
				return HttpResponse.json({ data: [] });
			}),
		);
		await apiFetch("/api/transactions?cat=food&q=a%20b");
		expect(seen).toEqual(["?cat=food&q=a%20b"]);
	});

	test("sends If-Match on a read only when given a version", async () => {
		const seen = capture("/api/x", "get");
		await apiFetch("/api/x", { version: 2 });
		expect(seen[0]!.headers.get("if-match")).toBe('"2"');
	});

	test("goes to the page's own origin", async () => {
		const seen = capture("/api/me", "get");
		await apiFetch("/api/me");
		expect(new URL(seen[0]!.url).origin).toBe(window.location.origin);
	});
});

describe("what a mutation sends (API-2, API-3, API-4)", () => {
	test.each(["POST", "PATCH", "DELETE"] as const)(
		"%s sends JSON with a fresh UUIDv7 Idempotency-Key",
		async (method) => {
			const seen = capture(
				"/api/x",
				method.toLowerCase() as "post" | "patch" | "delete",
			);
			await apiFetch("/api/x", { method, body: { a: 1 } });
			const request = seen[0]!;
			expect(request.headers.get("content-type")).toBe("application/json");
			expect(isUuidV7(request.headers.get("idempotency-key"))).toBe(true);
			expect(await request.json()).toEqual({ a: 1 });
		},
	);

	test("a mutation without a body sends {}", async () => {
		const seen = capture("/api/x/1", "delete");
		await apiFetch("/api/x/1", { method: "DELETE" });
		expect(await seen[0]!.text()).toBe("{}");
	});

	test("each call makes its own key", async () => {
		const seen = capture("/api/x", "post");
		await apiFetch("/api/x", { method: "POST" });
		await apiFetch("/api/x", { method: "POST" });
		const [first, second] = seen.map((r) => r.headers.get("idempotency-key"));
		expect(first).not.toBe(second);
	});

	test("a retry of the same action sends the key it is given", async () => {
		const seen = capture("/api/x", "post");
		const key = "0192f0c4-0000-7000-8000-000000000001";
		await apiFetch("/api/x", { method: "POST", idempotencyKey: key });
		await apiFetch("/api/x", { method: "POST", idempotencyKey: key });
		expect(seen.map((r) => r.headers.get("idempotency-key"))).toEqual([
			key,
			key,
		]);
	});

	test("sends the version as a quoted If-Match", async () => {
		const seen = capture("/api/x/1", "patch");
		await apiFetch("/api/x/1", { method: "PATCH", body: {}, version: 3 });
		expect(seen[0]!.headers.get("if-match")).toBe('"3"');
	});

	test("version 0 is still sent", async () => {
		const seen = capture("/api/x/1", "patch");
		await apiFetch("/api/x/1", { method: "PATCH", version: 0 });
		expect(seen[0]!.headers.get("if-match")).toBe('"0"');
	});

	test("never sends Daybook-Build, which only the write queue sends (D-507)", async () => {
		const seen = capture("/api/x", "post");
		await apiFetch("/api/x", { method: "POST" });
		expect(seen[0]!.headers.get("daybook-build")).toBeNull();
	});

	test("never sets If-Match without a version", async () => {
		const seen = capture("/api/x", "post");
		await apiFetch("/api/x", { method: "POST" });
		expect(seen[0]!.headers.get("if-match")).toBeNull();
	});
});

describe("refused paths", () => {
	test.each([
		["Better Auth's routes", "/api/auth/get-session"],
		["Better Auth's sign-in", "/api/auth/sign-in/email"],
		["a page", "/transactions"],
		["another origin", "https://evil.example/api/me"],
		["a protocol-relative URL", "//evil.example/api/me"],
		["a relative path", "api/me"],
		["the bare prefix", "/api"],
	])("refuses %s without a request", async (_name, path) => {
		await expect(apiFetch(path)).rejects.toThrow(TypeError);
	});
});

describe("errors (API-9)", () => {
	test("the timeout is 20 seconds (STATE-4, D-507)", () => {
		expect(API_TIMEOUT_MS).toBe(20_000);
	});

	test("reads the envelope into the error", async () => {
		network.use(
			http.post(url("/api/profile"), () =>
				envelope("validation_failed", 422, {
					fields: { timezone: "Choose a time zone in your country." },
					details: { limit: 20 },
				}),
			),
		);
		const error = await apiFetch("/api/profile", { method: "POST" }).catch(
			(e) => e,
		);
		expect(error).toBeInstanceOf(ApiRequestError);
		expect(error).toMatchObject({
			name: "ApiRequestError",
			kind: "http",
			status: 422,
			code: "validation_failed",
			message: "The validation_failed message.",
			fields: { timezone: "Choose a time zone in your country." },
			details: { limit: 20 },
			requestId: "req-1",
		});
	});

	test("an envelope without fields or details gives empty ones", async () => {
		network.use(http.get(url("/api/x"), () => envelope("not_found", 404)));
		expect(await failure("/api/x")).toMatchObject({ fields: {}, details: {} });
	});

	test("takes the request id from the header when the envelope has none", async () => {
		network.use(
			http.get(url("/api/x"), () =>
				HttpResponse.json(
					{ error: { code: "internal", message: "m" } },
					{ status: 500, headers: { "x-request-id": "req-h" } },
				),
			),
		);
		expect((await failure("/api/x")).requestId).toBe("req-h");
	});

	test.each([
		[
			"an HTML 502 from a proxy",
			new HttpResponse("<html>Bad gateway</html>", { status: 502 }),
		],
		["an empty 500", new HttpResponse(null, { status: 500 })],
		[
			"JSON that is not an envelope",
			HttpResponse.json({ oops: true }, { status: 400 }),
		],
		[
			"an envelope whose error is a string",
			HttpResponse.json({ error: "x" }, { status: 400 }),
		],
		[
			"an envelope whose code is a number",
			HttpResponse.json({ error: { code: 7 } }, { status: 400 }),
		],
	])("%s is an http error with no code", async (_name, response) => {
		network.use(http.get(url("/api/x"), () => response));
		const error = await failure("/api/x");
		expect(error.kind).toBe("http");
		expect(error.code).toBeNull();
		expect(error.message).toBe("");
		expect(error.fields).toEqual({});
	});

	test("fields and details that are not objects are dropped", async () => {
		network.use(
			http.get(url("/api/x"), () =>
				envelope("validation_failed", 422, { fields: ["a"], details: "d" }),
			),
		);
		expect(await failure("/api/x")).toMatchObject({ fields: {}, details: {} });
	});

	test("no answer at all is a network error, with the cause kept", async () => {
		network.use(http.get(url("/api/x"), () => HttpResponse.error()));
		const error = await failure("/api/x");
		expect(error).toMatchObject({ kind: "network", status: null, code: null });
		expect(error.cause).toBeDefined();
	});

	test(`no answer within ${API_TIMEOUT_MS / 1000} seconds is a timeout`, async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		network.use(
			http.get(url("/api/slow"), async () => {
				await delay("infinite");
				return HttpResponse.json({ data: 1 });
			}),
		);
		const pending = apiFetch("/api/slow").catch((e) => e);
		await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);
		expect(await pending).toMatchObject({ kind: "timeout", status: null });
	});

	test("an answer just inside the limit is not a timeout", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		network.use(
			http.get(url("/api/slowish"), async () => {
				await delay(API_TIMEOUT_MS - 1);
				return HttpResponse.json({ data: "ok" });
			}),
		);
		const pending = apiFetch("/api/slowish");
		await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
		expect(await pending).toBe("ok");
	});

	test("the caller's own cancel is passed on as it is, not as a timeout", async () => {
		network.use(
			http.get(url("/api/slow"), async () => {
				await delay("infinite");
				return HttpResponse.json({ data: 1 });
			}),
		);
		const controller = new AbortController();
		const pending = apiFetch("/api/slow", { signal: controller.signal }).catch(
			(e) => e,
		);
		controller.abort();
		const error = await pending;
		expect(error).not.toBeInstanceOf(ApiRequestError);
		expect((error as Error).name).toBe("AbortError");
	});

	test("an already cancelled call never answers", async () => {
		capture("/api/me", "get");
		const controller = new AbortController();
		controller.abort();
		await expect(
			apiFetch("/api/me", { signal: controller.signal }),
		).rejects.toMatchObject({
			name: "AbortError",
		});
	});
});

describe("what errors tell the app (STATE-4)", () => {
	test("a 401 sends unauthenticated", async () => {
		network.use(
			http.get(url("/api/me"), () => envelope("unauthenticated", 401)),
		);
		expect(await eventsDuring(() => apiFetch("/api/me"))).toEqual([
			{ type: "unauthenticated" },
		]);
	});

	test("a 401 without an envelope still sends unauthenticated", async () => {
		network.use(
			http.get(url("/api/me"), () => new HttpResponse(null, { status: 401 })),
		);
		expect(await eventsDuring(() => apiFetch("/api/me"))).toEqual([
			{ type: "unauthenticated" },
		]);
	});

	test("a 401 on a mutation sends it too", async () => {
		network.use(
			http.post(url("/api/x"), () => envelope("unauthenticated", 401)),
		);
		expect(
			await eventsDuring(() => apiFetch("/api/x", { method: "POST" })),
		).toEqual([{ type: "unauthenticated" }]);
	});

	test("a 403 profile_required sends profile_required", async () => {
		network.use(
			http.get(url("/api/x"), () => envelope("profile_required", 403)),
		);
		expect(await eventsDuring(() => apiFetch("/api/x"))).toEqual([
			{ type: "profile_required" },
		]);
	});

	test.each(["premium_required", "feature_off"])(
		"a 403 %s sends capabilities_changed",
		async (code) => {
			network.use(http.get(url("/api/x"), () => envelope(code, 403)));
			expect(await eventsDuring(() => apiFetch("/api/x"))).toEqual([
				{ type: "capabilities_changed" },
			]);
		},
	);

	test.each([
		["cross_origin", 403],
		["not_found", 404],
		["version_conflict", 409],
		["build_mismatch", 409],
		["validation_failed", 422],
		["rate_limited", 429],
		["internal", 500],
		["timeout", 503],
	])("%s (%i) sends nothing", async (code, status) => {
		network.use(http.get(url("/api/x"), () => envelope(code, status)));
		expect(await eventsDuring(() => apiFetch("/api/x"))).toEqual([]);
	});

	test("a network error sends nothing", async () => {
		network.use(http.get(url("/api/x"), () => HttpResponse.error()));
		expect(await eventsDuring(() => apiFetch("/api/x"))).toEqual([]);
	});

	test("a success sends nothing", async () => {
		capture("/api/me", "get");
		expect(await eventsDuring(() => apiFetch("/api/me"))).toEqual([]);
	});
});
