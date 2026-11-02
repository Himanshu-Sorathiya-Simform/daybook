import { act, renderHook } from "@testing-library/react";
import { HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { clearLogoutMarker, hasLogoutMarker } from "@/lib/logout-marker";
import { AUTH_MESSAGES } from "../../lib/messages";
import { authNetwork, route, SIGN_OUT } from "../../lib/tests/auth-network";
import { type AuthSubmitOptions, useAuthSubmit } from "../useAuthSubmit";

beforeAll(() => authNetwork.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	authNetwork.resetHandlers();
	clearLogoutMarker();
});
afterAll(() => authNetwork.close());

type Values = { email: string };

function setup(options: Partial<AuthSubmitOptions<Values>> = {}) {
	const navigate = vi.fn();
	const call = vi.fn(async () => ({ error: null }));
	const focusInvalid = vi.fn();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<AppProviders navigate={navigate}>{children}</AppProviders>
	);
	const hook = renderHook(
		() =>
			useAuthSubmit<Values>({
				call,
				destination: "/dashboard",
				focusInvalid,
				...options,
			}),
		{ wrapper },
	);
	return { ...hook, navigate, call, focusInvalid };
}

const send = (hook: { current: ReturnType<typeof useAuthSubmit<Values>> }) =>
	act(() => hook.current.submit({ email: "asha@example.com" }));

describe("useAuthSubmit", () => {
	test("calls with the values, then goes to the destination and stays leaving", async () => {
		const { result, call, navigate } = setup();
		await send(result);
		expect(call).toHaveBeenCalledExactlyOnceWith({ email: "asha@example.com" });
		expect(navigate).toHaveBeenCalledExactlyOnceWith("/dashboard");
		expect(result.current.leaving).toBe(true);
		expect(result.current.failure).toBeNull();
	});

	test("a refusal of one field: the field's message, no form line, focus asked for", async () => {
		const onRefused = vi.fn();
		const error = { code: "PASSWORD_BREACHED", status: 400 };
		const { result, navigate, focusInvalid } = setup({
			call: async () => ({ error }),
			onRefused,
		});
		await send(result);
		expect(result.current.failure).toEqual({
			field: "password",
			message: AUTH_MESSAGES.passwordBreached,
		});
		expect(result.current.formFailure).toBeNull();
		expect(onRefused).toHaveBeenCalledExactlyOnceWith(error);
		expect(focusInvalid).toHaveBeenCalledOnce();
		expect(navigate).not.toHaveBeenCalled();
		expect(result.current.leaving).toBe(false);
	});

	test("a refusal of the whole form gives the form line", async () => {
		const { result } = setup({
			call: async () => ({
				error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 },
			}),
		});
		await send(result);
		expect(result.current.formFailure).toBe(AUTH_MESSAGES.wrongCredentials);
	});

	test("no answer at all is the generic line, and nothing else is asked", async () => {
		const { result, focusInvalid } = setup({
			call: async () => {
				throw new TypeError("Failed to fetch");
			},
		});
		await send(result);
		expect(result.current.formFailure).toBe(AUTH_MESSAGES.failed);
		expect(focusInvalid).not.toHaveBeenCalled();
	});

	test("a logout that cannot finish stops everything before the call (BR-F01-15)", async () => {
		document.cookie = "daybook_logout=1; Path=/";
		route("post", SIGN_OUT, () => HttpResponse.error());
		const { result, call, navigate } = setup();
		await send(result);
		expect(result.current.formFailure).toBe(AUTH_MESSAGES.oldSession);
		expect(call).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(hasLogoutMarker()).toBe(true);
	});

	test("a new submit clears the last failure first", async () => {
		let error: { code: string; status: number } | null = {
			code: "X",
			status: 500,
		};
		const { result } = setup({ call: async () => ({ error }) });
		await send(result);
		expect(result.current.formFailure).toBe(AUTH_MESSAGES.failed);
		error = null;
		await send(result);
		expect(result.current.failure).toBeNull();
	});

	describe("changed", () => {
		test("takes away the edited field's message", async () => {
			const { result } = setup({
				call: async () => ({ error: { code: "INVALID_NAME", status: 400 } }),
			});
			await send(result);
			act(() => result.current.changed("name"));
			expect(result.current.failure).toBeNull();
		});

		test("leaves another field's message", async () => {
			const { result } = setup({
				call: async () => ({ error: { code: "INVALID_NAME", status: 400 } }),
			});
			await send(result);
			act(() => result.current.changed("email"));
			expect(result.current.failure).toEqual({
				field: "name",
				message: AUTH_MESSAGES.name,
			});
		});

		test("leaves a form line", async () => {
			const { result } = setup({
				call: async () => ({
					error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 },
				}),
			});
			await send(result);
			act(() => result.current.changed("email"));
			expect(result.current.formFailure).toBe(AUTH_MESSAGES.wrongCredentials);
		});
	});
});
