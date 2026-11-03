import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { API_TIMEOUT_MS } from "../api/client";
import { signOutStatus } from "../sign-out";

const SIGN_OUT = new URL("/api/auth/sign-out", window.location.origin).toString();

// Better Auth's client asks for the session after a sign-out; it has none.
const network = setupServer(
	http.get(
		new URL("/api/auth/get-session", window.location.origin).toString(),
		() => HttpResponse.json(null),
	),
);

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	network.resetHandlers();
});
afterAll(() => network.close());

/** Answers sign-out with `respond`, counting the calls. */
function signOut(respond: () => Response | Promise<Response>) {
	const calls: Request[] = [];
	network.use(
		http.post(SIGN_OUT, ({ request }) => {
			calls.push(request);
			return respond();
		}),
	);
	return calls;
}

/** A sign-out that answers only when the test says, and says when it has the request.
 * Waiting on `reached` moves no fake time, unlike `vi.waitFor`. */
function heldSignOut() {
	let arrived!: () => void;
	const reached = new Promise<void>((resolve) => {
		arrived = resolve;
	});
	let answer!: () => void;
	const released = new Promise<void>((resolve) => {
		answer = resolve;
	});
	signOut(async () => {
		arrived();
		await released;
		return HttpResponse.json({ success: true });
	});
	return { reached, answer };
}

const refusal = (status: number) =>
	HttpResponse.json({ code: "X", message: "No" }, { status });

describe("signOutStatus (D-502, D-515)", () => {
	test("success answers 200, with one POST to Better Auth", async () => {
		const calls = signOut(() => HttpResponse.json({ success: true }));
		expect(await signOutStatus()).toBe(200);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("POST");
	});

	test.each([400, 401, 403, 404, 429, 500, 502, 503])(
		"a %s answers its status",
		async (status) => {
			signOut(() => refusal(status));
			expect(await signOutStatus()).toBe(status);
		},
	);

	test("a 503 with no body still answers 503", async () => {
		signOut(() => new HttpResponse(null, { status: 503 }));
		expect(await signOutStatus()).toBe(503);
	});

	test("a network error answers null", async () => {
		signOut(() => HttpResponse.error());
		expect(await signOutStatus()).toBeNull();
	});

	test("offline, answers null without calling", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const calls = signOut(() => HttpResponse.json({ success: true }));
		expect(await signOutStatus()).toBeNull();
		expect(calls).toHaveLength(0);
	});

	test("no answer within 20 seconds answers null", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const { reached } = heldSignOut();
		const status = signOutStatus();
		await reached;
		await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);
		expect(await status).toBeNull();
	});

	test("an answer just inside 20 seconds still counts", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const { reached, answer } = heldSignOut();
		const status = signOutStatus();
		await reached;
		await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1);
		answer();
		expect(await status).toBe(200);
	});

	test("the timer is cleared after an answer", async () => {
		signOut(() => HttpResponse.json({ success: true }));
		const clear = vi.spyOn(globalThis, "clearTimeout");
		await signOutStatus();
		expect(clear).toHaveBeenCalled();
	});
});
