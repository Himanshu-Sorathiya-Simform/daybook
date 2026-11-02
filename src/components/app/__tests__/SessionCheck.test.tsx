import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { SESSION_EXPIRED_MESSAGE } from "../SessionExpiredBanner";
import { url } from "./helpers";

const network = setupServer();
const GET_SESSION = url("/api/auth/get-session");

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(async () => {
	vi.useRealTimers();
	// Better Auth's focus listener is global. A store stops listening one second after its last
	// subscriber leaves (nanostores' unmount delay), so each test waits that out after unmounting
	// and the next one hears only its own checks.
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 1100));
	network.resetHandlers();
});
afterAll(() => network.close());

const SESSION = {
	session: {
		id: "s1",
		userId: "u1",
		token: "t",
		expiresAt: "2026-11-09T06:30:00.000Z",
		createdAt: "2026-11-02T06:30:00.000Z",
		updatedAt: "2026-11-02T06:30:00.000Z",
	},
	user: {
		id: "u1",
		email: "asha@example.com",
		name: "Asha",
		emailVerified: false,
		createdAt: "2026-11-02T06:30:00.000Z",
		updatedAt: "2026-11-02T06:30:00.000Z",
	},
};

/** Answers get-session with `respond`, keeping each request. */
function getSession(respond: () => Response) {
	const seen: Request[] = [];
	network.use(
		http.get(GET_SESSION, ({ request }) => {
			seen.push(request);
			return respond();
		}),
	);
	return seen;
}

/** Renders the check and the banner from freshly loaded modules. Better Auth's session store
 * lives in a module and keeps its last answer, so each test needs its own copy. */
async function renderCheck() {
	vi.resetModules();
	const [{ AppProviders }, { SessionCheck }, { SessionExpiredBanner }] =
		await Promise.all([
			import("../AppProviders"),
			import("../SessionCheck"),
			import("../SessionExpiredBanner"),
		]);
	return render(
		<AppProviders navigate={vi.fn()}>
			<SessionCheck />
			<SessionExpiredBanner />
		</AppProviders>,
	);
}

/** Waits for the check's request, then lets React settle. */
async function settle(seen: Request[]) {
	await waitFor(() => expect(seen.length).toBeGreaterThan(0));
	await new Promise((resolve) => setTimeout(resolve, 30));
}

describe("SessionCheck (BR-F01-12, D-508)", () => {
	test("calls get-session once when it first renders", async () => {
		const seen = getSession(() => HttpResponse.json(SESSION));
		await renderCheck();
		await settle(seen);
		expect(seen).toHaveLength(1);
		expect(seen[0]!.method).toBe("GET");
	});

	test("asks the page's own origin, under /api/auth", async () => {
		const seen = getSession(() => HttpResponse.json(SESSION));
		await renderCheck();
		await settle(seen);
		const target = new URL(seen[0]!.url);
		expect(target.origin).toBe(window.location.origin);
		expect(target.pathname).toBe("/api/auth/get-session");
	});

	test("a live session shows no banner", async () => {
		const seen = getSession(() => HttpResponse.json(SESSION));
		await renderCheck();
		await settle(seen);
		expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument();
	});

	// BR-F01-13
	test("no session shows the session-expired banner", async () => {
		getSession(() => HttpResponse.json(null));
		await renderCheck();
		expect(await screen.findByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument();
	});

	test("an empty answer counts as no session", async () => {
		getSession(() => new HttpResponse(null, { status: 200 }));
		await renderCheck();
		expect(await screen.findByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument();
	});

	test.each([
		["a 500", () => HttpResponse.json({ message: "down" }, { status: 500 })],
		[
			"a 429",
			() => HttpResponse.json({ message: "slow down" }, { status: 429 }),
		],
		[
			"a 401 from Better Auth",
			() => HttpResponse.json({ code: "x" }, { status: 401 }),
		],
		["no answer", () => HttpResponse.error()],
	])("a failed check (%s) says nothing", async (_name, respond) => {
		const seen = getSession(respond);
		await renderCheck();
		await settle(seen);
		expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument();
	});

	describe("on returning to the tab", () => {
		const returnToTab = () =>
			document.dispatchEvent(new Event("visibilitychange"));

		test("checks again once 5 seconds have passed since the last check", async () => {
			vi.useFakeTimers({
				toFake: ["Date"],
				now: new Date("2026-11-02T06:30:00Z"),
			});
			const seen = getSession(() => HttpResponse.json(SESSION));
			await renderCheck();
			await settle(seen);
			const before = seen.length;
			vi.setSystemTime(new Date("2026-11-02T06:30:06Z"));
			returnToTab();
			await waitFor(() => expect(seen.length).toBeGreaterThan(before));
		});

		test("after a focus check, further returns within 5 seconds do not check", async () => {
			vi.useFakeTimers({
				toFake: ["Date"],
				now: new Date("2026-11-02T07:00:00Z"),
			});
			const seen = getSession(() => HttpResponse.json(SESSION));
			await renderCheck();
			await settle(seen);
			// Better Auth's 5 seconds run from the last focus check, not from the first render's.
			returnToTab();
			await waitFor(() => expect(seen).toHaveLength(2));
			returnToTab();
			vi.setSystemTime(new Date("2026-11-02T07:00:04Z"));
			returnToTab();
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(seen).toHaveLength(2);
			vi.setSystemTime(new Date("2026-11-02T07:00:06Z"));
			returnToTab();
			await waitFor(() => expect(seen).toHaveLength(3));
		});

		test("a session revoked elsewhere shows the banner on the next check", async () => {
			vi.useFakeTimers({
				toFake: ["Date"],
				now: new Date("2026-11-02T08:00:00Z"),
			});
			let live = true;
			const seen = getSession(() => HttpResponse.json(live ? SESSION : null));
			await renderCheck();
			await settle(seen);
			expect(
				screen.queryByText(SESSION_EXPIRED_MESSAGE),
			).not.toBeInTheDocument();
			live = false;
			vi.setSystemTime(new Date("2026-11-02T08:00:10Z"));
			returnToTab();
			expect(
				await screen.findByText(SESSION_EXPIRED_MESSAGE),
			).toBeInTheDocument();
		});
	});
});
