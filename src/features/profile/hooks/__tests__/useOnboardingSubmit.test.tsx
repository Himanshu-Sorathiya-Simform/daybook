import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { url } from "@/components/app/__tests__/helpers";
import { ONBOARDING_TEXT } from "../../lib/messages";
import { useOnboardingSubmit } from "../useOnboardingSubmit";

const network = setupServer();
const PROFILE = url("/api/profile");

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const VALUES = {
	country: "IN",
	currency: "INR",
	timezone: "Asia/Kolkata",
	weekStart: "sunday",
} as const;

function setup() {
	const navigate = vi.fn();
	const focusInvalid = vi.fn();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<AppProviders navigate={navigate}>{children}</AppProviders>
	);
	const hook = renderHook(() => useOnboardingSubmit(focusInvalid), { wrapper });
	return { ...hook, navigate, focusInvalid };
}

const envelope = (status: number, code: string, fields?: Record<string, string>) =>
	HttpResponse.json(
		{
			error: {
				code,
				message: "m",
				requestId: "r",
				...(fields ? { fields } : {}),
			},
		},
		{ status },
	);

describe("useOnboardingSubmit (BR-F02-08)", () => {
	test("posts the values, then opens /transactions; busy stays on while it loads", async () => {
		const bodies: unknown[] = [];
		network.use(
			http.post(PROFILE, async ({ request }) => {
				bodies.push(await request.json());
				return HttpResponse.json({ data: {} }, { status: 201 });
			}),
		);
		const { result, navigate } = setup();
		await act(() => result.current.submit(VALUES));
		expect(bodies).toEqual([VALUES]);
		expect(navigate).toHaveBeenCalledExactlyOnceWith("/transactions");
		expect(result.current.busy).toBe(true);
	});

	test("a 422 gives each field its message and asks for focus", async () => {
		network.use(
			http.post(PROFILE, () =>
				envelope(422, "validation_failed", {
					timezone: "Choose a time zone in your country.",
				}),
			),
		);
		const { result, focusInvalid, navigate } = setup();
		await act(() => result.current.submit(VALUES));
		expect(result.current.errors).toEqual({
			timezone: "Choose a time zone in your country.",
		});
		expect(result.current.failure).toBeNull();
		expect(result.current.busy).toBe(false);
		expect(focusInvalid).toHaveBeenCalledOnce();
		expect(navigate).not.toHaveBeenCalled();
	});

	test("a 401 leaves the error line off; the banner says it", async () => {
		network.use(http.post(PROFILE, () => envelope(401, "unauthenticated")));
		const { result } = setup();
		await act(() => result.current.submit(VALUES));
		expect(result.current.failure).toBeNull();
		expect(result.current.errors).toEqual({});
	});

	test.each([
		["a 500", () => envelope(500, "internal")],
		["a 422 with no fields", () => envelope(422, "idempotency_key_reused")],
		["no answer", () => HttpResponse.error()],
	])("%s gives F02's error line", async (_name, respond) => {
		network.use(http.post(PROFILE, respond));
		const { result, focusInvalid } = setup();
		await act(() => result.current.submit(VALUES));
		expect(result.current.failure).toBe(ONBOARDING_TEXT.failed);
		expect(focusInvalid).not.toHaveBeenCalled();
	});

	test("a new submit clears the last error line", async () => {
		let status = 500;
		network.use(
			http.post(PROFILE, () =>
				status === 500 ?
					envelope(500, "internal")
				:	HttpResponse.json({ data: {} }),
			),
		);
		const { result } = setup();
		await act(() => result.current.submit(VALUES));
		status = 201;
		await act(() => result.current.submit(VALUES));
		expect(result.current.failure).toBeNull();
	});

	test("clear takes the named fields' messages away and keeps the rest", async () => {
		network.use(
			http.post(PROFILE, () =>
				envelope(422, "validation_failed", {
					currency: "Choose one of the listed currencies.",
					weekStart: "Choose the first day of your week.",
				}),
			),
		);
		const { result } = setup();
		await act(() => result.current.submit(VALUES));
		act(() => result.current.clear("currency"));
		expect(result.current.errors).toEqual({
			weekStart: "Choose the first day of your week.",
		});
	});
});
