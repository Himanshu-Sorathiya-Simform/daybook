import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { apiFetch } from "@/lib/api/client";
import { subscriptionAnswer } from "../../lib/__tests__/fixtures";
import { refuse, renderHookInApp, route, testClient } from "./helpers";
import { useWriteRefusal } from "../useWriteRefusal";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const PATH = "/api/subscriptions/x";

/** The error a write to `PATH` fails with, as the client makes it from the answer. */
async function failure(answer: () => Response): Promise<unknown> {
	route(network, "patch", PATH, answer);
	try {
		await apiFetch(PATH, { method: "PATCH", body: {}, version: 1 });
	} catch (error) {
		return error;
	}
	throw new Error("the write did not fail");
}

function setup(
	own: Parameters<typeof useWriteRefusal>[0] = ["name", "amountMinor"],
) {
	const queryClient = testClient();
	const invalidate = vi.spyOn(queryClient, "invalidateQueries");
	const view = renderHookInApp(() => useWriteRefusal(own), { queryClient });
	const refused = async (error: unknown) => {
		let kind: string | undefined;
		await act(async () => {
			kind = await view.result.current.refuse(error);
		});
		return kind;
	};
	return { ...view, refused, invalidate };
}

describe("a 422 (section 8)", () => {
	test("puts a message under the field the dialog has", async () => {
		const { result, refused } = setup();
		const kind = await refused(
			await failure(() =>
				refuse(422, "validation_failed", {
					message: "Check the form.",
					fields: { name: "Use 60 characters or fewer." },
				}),
			),
		);
		expect(kind).toBe("fields");
		expect(result.current.fields).toEqual({
			name: "Use 60 characters or fewer.",
		});
		expect(result.current.failure).toBeNull();
	});

	test("a message for a field the dialog has no box for is its own line", async () => {
		const { result, refused } = setup();
		await refused(
			await failure(() =>
				refuse(422, "validation_failed", {
					message: "m",
					fields: { createdAt: "This change is too old to apply." },
				}),
			),
		);
		expect(result.current.fields).toEqual({});
		expect(result.current.failure).toBe("This change is too old to apply.");
	});

	test("a message with no field of its own comes before one for a field the dialog lacks", async () => {
		const { result, refused } = setup();
		await refused(
			await failure(() =>
				refuse(422, "validation_failed", {
					message: "m",
					fields: {
						endDate: "The end date can't be before the start date.",
						changedAt: "The change time can't be in the future.",
					},
				}),
			),
		);
		expect(result.current.failure).toBe(
			"The change time can't be in the future.",
		);
	});

	test("the fields it has are kept apart from those it has not", async () => {
		const { result, refused } = setup();
		await refused(
			await failure(() =>
				refuse(422, "validation_failed", {
					message: "m",
					fields: {
						amountMinor: "Enter an amount.",
						pause: "Choose a date.",
					},
				}),
			),
		);
		expect(result.current.fields).toEqual({ amountMinor: "Enter an amount." });
	});
});

describe("the other refusals", () => {
	test("a failed request says it could not be saved", async () => {
		const { result, refused } = setup();
		const kind = await refused(
			await failure(() => refuse(500, "internal_error")),
		);
		expect(kind).toBe("form");
		expect(result.current.failure).toBe(
			"The Subscription could not be saved. Check your connection and try again. Your changes are still here.",
		);
	});

	test("a 404 says it was deleted on another device and reads the page again", async () => {
		const { result, refused, invalidate } = setup();
		const kind = await refused(
			await failure(() => refuse(404, "not_found", { message: "gone" })),
		);
		expect(kind).toBe("gone");
		expect(result.current.failure).toBe(
			"This Subscription was deleted on another device.",
		);
		expect(invalidate).toHaveBeenCalled();
	});

	test("a 409 says it changed on another device and reads the page again", async () => {
		const { result, refused, invalidate } = setup();
		const kind = await refused(
			await failure(() =>
				refuse(409, "version_conflict", {
					message: "m",
					details: {
						current: subscriptionAnswer("netflix", { version: 2 }),
					},
				}),
			),
		);
		expect(kind).toBe("conflict");
		expect(result.current.failure).toMatch(
			/^This Subscription changed on another device\./,
		);
		expect(invalidate).toHaveBeenCalled();
	});

	test("a 401 shows nothing, since the app answers it", async () => {
		const { result, refused, invalidate } = setup();
		const kind = await refused(
			await failure(() => refuse(401, "unauthenticated")),
		);
		expect(kind).toBe("handled");
		expect(result.current.failure).toBeNull();
		expect(invalidate).not.toHaveBeenCalled();
	});

	test("an error that is not the API's is a bug and is thrown on", async () => {
		const { result } = setup();
		await expect(result.current.refuse(new Error("bug"))).rejects.toThrow("bug");
	});

	test("an answer without a body is a failed save", async () => {
		const { result, refused } = setup();
		await refused(
			await failure(() => HttpResponse.text("oops", { status: 502 })),
		);
		expect(result.current.failure).toMatch(
			/^The Subscription could not be saved\./,
		);
	});
});

describe("clearing", () => {
	async function withMessages() {
		const view = setup();
		await view.refused(
			await failure(() =>
				refuse(422, "validation_failed", {
					message: "Check the form.",
					fields: { name: "A", amountMinor: "B" },
				}),
			),
		);
		return view;
	}

	test("one field's message goes with the line, and the other stays", async () => {
		const { result } = await withMessages();
		act(() => result.current.clearField("name"));
		expect(result.current.fields).toEqual({ amountMinor: "B" });
		expect(result.current.failure).toBeNull();
	});

	test("reset clears them all", async () => {
		const { result } = await withMessages();
		act(() => result.current.reset());
		expect(result.current.fields).toEqual({});
		expect(result.current.failure).toBeNull();
	});

	test("clearing a field that has no message changes nothing else", () => {
		const { result } = setup();
		act(() => result.current.clearField("name"));
		expect(result.current.fields).toEqual({});
	});
});
