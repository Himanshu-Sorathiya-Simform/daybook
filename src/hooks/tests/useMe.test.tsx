import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { isMeKey, ME_KEY, ME_STALE_MS, useMe } from "../useMe";
import { meFor, renderInApp, url } from "@/components/app/tests/helpers";

const network = setupServer();

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.useRealTimers();
	focusManager.setFocused(undefined);
});
afterAll(() => network.close());

function countedMe(id = "u1") {
	let calls = 0;
	network.use(
		http.get(url("/api/me"), () => {
			calls += 1;
			return HttpResponse.json({ data: meFor(id) });
		}),
	);
	return () => calls;
}

function MeView() {
	const { data, error } = useMe();
	if (error) return <p>error {(error as { code?: string }).code}</p>;
	return <p>{data ? `user ${data.user.id}` : "loading"}</p>;
}

describe("useMe (BR-P4-12)", () => {
	test("fetches /api/me and caches it under ['me']", async () => {
		countedMe("u1");
		const { queryClient } = renderInApp(<MeView />);
		expect(await screen.findByText("user u1")).toBeInTheDocument();
		expect(queryClient.getQueryData(ME_KEY)).toEqual(meFor("u1"));
	});

	test("stays fresh for 60 seconds", () => {
		expect(ME_STALE_MS).toBe(60_000);
	});

	test("two components share one request", async () => {
		const calls = countedMe();
		renderInApp(
			<>
				<MeView />
				<MeView />
			</>,
		);
		await screen.findAllByText("user u1");
		expect(calls()).toBe(1);
	});

	test("focus within 60 seconds does not refetch", async () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-02T06:30:00Z"),
		});
		const calls = countedMe();
		renderInApp(<MeView />);
		await screen.findByText("user u1");
		vi.setSystemTime(new Date("2026-11-02T06:30:59Z"));
		act(() => {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(calls()).toBe(1);
	});

	test("focus once the answer is older than 60 seconds refetches", async () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-02T06:30:00Z"),
		});
		const calls = countedMe();
		renderInApp(<MeView />);
		await screen.findByText("user u1");
		vi.setSystemTime(new Date("2026-11-02T06:31:01Z"));
		act(() => {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
		});
		await waitFor(() => expect(calls()).toBe(2));
	});

	test("an error answer surfaces as the query's error", async () => {
		network.use(
			http.get(url("/api/me"), () =>
				HttpResponse.json(
					{ error: { code: "internal", message: "m", requestId: "r" } },
					{ status: 500 },
				),
			),
		);
		renderInApp(<MeView />);
		expect(await screen.findByText("error internal")).toBeInTheDocument();
	});
});

describe("isMeKey", () => {
	test.each([
		[["me"], true],
		[["me", "extra"], true],
		[["profile"], false],
		[[], false],
		[[{ me: true }], false],
	])("%j is %s", (key, expected) => {
		expect(isMeKey(key)).toBe(expected);
	});
});
