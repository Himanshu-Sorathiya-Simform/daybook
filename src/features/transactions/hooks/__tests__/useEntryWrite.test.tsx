import { act } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { ApiRequestError } from "@/lib/api/client";
import { row } from "../../lib/__tests__/fixtures";
import type { EntryLocale } from "../../lib/entry";
import { useEntryWrite } from "../useEntryWrite";
import { renderHookInApp } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const LOCALE: EntryLocale = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

const http = (
	status: number,
	code: string | null,
	fields: Record<string, string> = {},
) =>
	new ApiRequestError("http", {
		status,
		code,
		message: "",
		fields,
		details: {},
	});

function setup(editing: ReturnType<typeof row> | null = null) {
	const handlers = { onClose: vi.fn(), onFieldsRefused: vi.fn() };
	const view = renderHookInApp(() =>
		useEntryWrite({ editing, locale: LOCALE, ...handlers }),
	);
	return { ...view, ...handlers };
}

describe("useEntryWrite (flows 7.1 and 7.3, BR-F03-24)", () => {
	test("starts with nothing to show", () => {
		const { result } = setup();
		expect(result.current.server).toEqual({});
		expect(result.current.failure).toBeNull();
		expect(result.current.conflict).toBeNull();
	});

	test("a 422 puts each message under its field, asks for focus, and the first unnamed one is the line", () => {
		const { result, onFieldsRefused } = setup();
		act(() =>
			result.current.refused(
				http(422, "validation_failed", {
					amountMinor: "Too big.",
					payee: "Too long.",
				}),
			),
		);
		expect(result.current.server).toEqual({
			amount: "Too big.",
			payee: "Too long.",
		});
		expect(onFieldsRefused).toHaveBeenCalledOnce();
	});

	test("a failed request is one line", () => {
		const { result } = setup();
		act(() => result.current.refused(new ApiRequestError("network")));
		expect(result.current.failure).toBe("Your change wasn't saved. Try again.");
	});

	test("a 401 shows nothing, since the app answers it", () => {
		const { result } = setup();
		act(() => result.current.refused(http(401, "unauthenticated")));
		expect(result.current.failure).toBeNull();
		expect(result.current.server).toEqual({});
	});

	test("a create's 404 reads as a failed save", () => {
		const { result } = setup();
		act(() => result.current.refused(http(404, "not_found")));
		expect(result.current.failure).toBe("Your change wasn't saved. Try again.");
	});

	test("changing a field clears its message, and reset clears all of them", () => {
		const { result } = setup();
		act(() =>
			result.current.refused(
				http(422, "validation_failed", {
					amountMinor: "Too big.",
					payee: "Too long.",
				}),
			),
		);
		act(() => result.current.clear("amount"));
		expect(result.current.server).toEqual({ payee: "Too long." });
		act(() => result.current.reset());
		expect(result.current.server).toEqual({});
		expect(result.current.failure).toBeNull();
	});

	test("a conflict stays over the dialog until it is closed", () => {
		const { result, onClose } = setup(row());
		const current = row({ version: 2 });
		act(() =>
			result.current.setConflict({ current, change: { currency: "INR" } }),
		);
		expect(result.current.conflict?.current).toEqual(current);
		act(() => result.current.closeConflict());
		expect(result.current.conflict).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("Keep theirs closes the view and the dialog", () => {
		const { result, onClose } = setup(row());
		const current = row({ version: 2 });
		act(() =>
			result.current.setConflict({ current, change: { currency: "INR" } }),
		);
		act(() => result.current.keepTheirs(current));
		expect(result.current.conflict).toBeNull();
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("a non-API error is a bug and is thrown on", () => {
		const { result } = setup();
		expect(() => result.current.refused(new Error("bug"))).toThrow("bug");
	});
});
