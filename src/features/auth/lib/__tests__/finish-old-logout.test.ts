import { HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { clearLogoutMarker, hasLogoutMarker } from "@/lib/logout-marker";
import { finishOldLogout } from "../finish-old-logout";
import { authNetwork, refusal, route, SIGN_OUT } from "./auth-network";

beforeAll(() => authNetwork.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	authNetwork.resetHandlers();
	clearLogoutMarker();
});
afterAll(() => authNetwork.close());

const setMarker = () => {
	document.cookie = "daybook_logout=1; Path=/";
};

describe("finishOldLogout (BR-F01-15, D-384)", () => {
	test("without a marker, goes on at once and calls nothing", async () => {
		const calls = route("post", SIGN_OUT, () =>
			HttpResponse.json({ success: true }),
		);
		expect(await finishOldLogout()).toBe(true);
		expect(calls).toHaveLength(0);
	});

	test.each([
		["a 200", () => HttpResponse.json({ success: true })],
		["a 400, no session left", () => refusal("FAILED_TO_GET_SESSION", 400)],
		["a 401, no session left", () => refusal("UNAUTHORIZED", 401)],
	])(
		"with a marker, signs out first; %s counts, so the marker goes",
		async (_name, respond) => {
			setMarker();
			const calls = route("post", SIGN_OUT, respond);
			expect(await finishOldLogout()).toBe(true);
			expect(calls).toHaveLength(1);
			expect(hasLogoutMarker()).toBe(false);
		},
	);

	test.each([
		["a 403", () => refusal("INVALID_ORIGIN", 403)],
		["a 429", () => refusal("TOO_MANY_REQUESTS", 429)],
		["a 500", () => refusal("INTERNAL", 500)],
		["a 503", () => new HttpResponse(null, { status: 503 })],
		["no answer", () => HttpResponse.error()],
	])(
		"%s does not count: the form stops and the marker stays",
		async (_name, respond) => {
			setMarker();
			route("post", SIGN_OUT, respond);
			expect(await finishOldLogout()).toBe(false);
			expect(hasLogoutMarker()).toBe(true);
		},
	);
});
