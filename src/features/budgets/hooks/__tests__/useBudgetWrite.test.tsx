import { act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ApiRequestError } from "@/lib/api/client";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import { readBudgetDeleteRefusal } from "../../lib/write-errors";
import { renderHookInApp, testClient } from "./helpers";
import { useBudgetWrite } from "../useBudgetWrite";

const CURRENT = budgetAnswer("food", { version: 3 });

const http = (
	status: number,
	code: string | null,
	extra: {
		message?: string;
		fields?: Record<string, string>;
		details?: Record<string, unknown>;
	} = {},
) =>
	new ApiRequestError("http", {
		status,
		code,
		message: extra.message ?? "",
		fields: extra.fields ?? {},
		details: extra.details ?? {},
	});

const CONFLICT = http(409, "version_conflict", { details: { current: CURRENT } });
const EXISTS = http(409, "budget_exists", { details: { current: CURRENT } });

function setup() {
	const onClose = vi.fn();
	const queryClient = testClient();
	const invalidate = vi.spyOn(queryClient, "invalidateQueries");
	const view = renderHookInApp(() => useBudgetWrite<string>(onClose), {
		queryClient,
	});
	const handlers = {
		conflictOf: vi.fn((current: { version: number }) => `v${current.version}`),
		onExists: vi.fn(),
		onFields: vi.fn(),
	};
	const refused = (
		error: unknown,
		more: Partial<Parameters<typeof view.result.current.refuse>[1]> = {},
	) =>
		act(async () => {
			await view.result.current.refuse(error, { ...handlers, ...more });
		});
	return { ...view, ...handlers, onClose, invalidate, refused };
}

describe("useBudgetWrite (BR-F04-23, section 8)", () => {
	test("starts with nothing to show", () => {
		const { result } = setup();
		expect(result.current.failure).toBeNull();
		expect(result.current.server).toEqual({});
		expect(result.current.conflict).toBeNull();
	});

	test("a 409 version_conflict is the conflict view, with what the dialog made of it", async () => {
		const { result, refused, conflictOf } = setup();
		await refused(CONFLICT);
		expect(conflictOf).toHaveBeenCalledWith(CURRENT);
		expect(result.current.conflict).toBe("v3");
		expect(result.current.failure).toBeNull();
	});

	test("a 422 puts its messages under the fields and asks for focus", async () => {
		const { result, refused, onFields } = setup();
		await refused(
			http(422, "validation_failed", { fields: { limitMinor: "Too big." } }),
		);
		expect(result.current.server).toEqual({ limitMinor: "Too big." });
		expect(onFields).toHaveBeenCalledOnce();
	});

	test("budget_exists is the dialog's to answer, and shows no line", async () => {
		const { result, refused, onExists } = setup();
		await refused(EXISTS);
		expect(onExists).toHaveBeenCalledWith(CURRENT);
		expect(result.current.failure).toBeNull();
		expect(result.current.conflict).toBeNull();
	});

	test("a 404 says it was deleted on another device and reads the page again", async () => {
		const { result, refused, invalidate } = setup();
		await refused(http(404, "not_found"));
		expect(result.current.failure).toBe(
			"This Budget was deleted on another device.",
		);
		expect(invalidate).toHaveBeenCalled();
	});

	test("a failed request is the dialog's own line", async () => {
		const { result, refused } = setup();
		await refused(new ApiRequestError("network"));
		expect(result.current.failure).toMatch(/could not be saved/);
	});

	test("a 401 shows nothing, since the app answers it", async () => {
		const { result, refused } = setup();
		await refused(http(401, "unauthenticated"));
		expect(result.current.failure).toBeNull();
		expect(result.current.conflict).toBeNull();
	});

	test("any other refusal closes the conflict view", async () => {
		const { result, refused } = setup();
		await refused(CONFLICT);
		await refused(new ApiRequestError("network"));
		expect(result.current.conflict).toBeNull();
	});

	test("a delete's refusal is read by its own words", async () => {
		const { result, refused } = setup();
		await refused(new ApiRequestError("network"), {
			read: readBudgetDeleteRefusal,
		});
		expect(result.current.failure).toMatch(/could not be deleted/);
	});

	test("changing a field clears its message and the line, and reset clears both", async () => {
		const { result, refused } = setup();
		await refused(
			http(422, "validation_failed", {
				fields: { limitMinor: "Too big.", category: "Pick one." },
			}),
		);
		act(() => result.current.clearField("limitMinor"));
		expect(result.current.server).toEqual({ category: "Pick one." });
		expect(result.current.failure).toBeNull();
		act(() => result.current.reset());
		expect(result.current.server).toEqual({});
	});

	test("Keep theirs closes the view and the dialog, and reads the page again", async () => {
		const { result, refused, onClose, invalidate } = setup();
		await refused(CONFLICT);
		act(() => result.current.keepTheirs());
		expect(result.current.conflict).toBeNull();
		expect(onClose).toHaveBeenCalledOnce();
		expect(invalidate).toHaveBeenCalled();
	});

	test("closing the view without a choice keeps the dialog", async () => {
		const { result, refused, onClose } = setup();
		await refused(CONFLICT);
		act(() => result.current.closeConflict());
		expect(result.current.conflict).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a non-API error is a bug and is thrown on", async () => {
		const { result } = setup();
		await expect(
			result.current.refuse(new Error("bug"), {
				conflictOf: () => "x",
			}),
		).rejects.toThrow("bug");
	});
});
