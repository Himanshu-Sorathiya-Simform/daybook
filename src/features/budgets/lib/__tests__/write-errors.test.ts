import { describe, expect, test } from "vitest";

import { ApiRequestError } from "@/lib/api/client";
import {
	readBudgetDeleteError,
	readBudgetDeleteRefusal,
	readBudgetNoticeError,
	readBudgetWriteError,
} from "../write-errors";
import { budgetAnswer } from "./fixtures";

const SAVE_FAILED =
	"The Budget could not be saved. Check your connection and try again. Your changes are still here.";
const DELETE_FAILED =
	"The Budget could not be deleted. Check your connection and try again.";
const NOTICE_FAILED =
	"The Budget could not be saved. Check your connection and try again.";
const GONE = "This Budget was deleted on another device.";

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

const NETWORK = new ApiRequestError("network");
const TIMEOUT = new ApiRequestError("timeout");
const UNREADABLE = new ApiRequestError("http", { status: 200 });

/** Every way `details.current` can fail to be a Budget. */
const NOT_A_BUDGET: [string, unknown][] = [
	["missing", undefined],
	["null", null],
	["a string", "food"],
	["without an id", { ...CURRENT, id: 7 }],
	["without a version", { ...CURRENT, version: "3" }],
	["without a category", { ...CURRENT, category: null }],
	["without a schedule list", { ...CURRENT, schedule: {} }],
	["without an overrides list", { ...CURRENT, overrides: undefined }],
];

describe("readBudgetWriteError (flows 7.1 to 7.4, section 8)", () => {
	test.each([
		["no answer", NETWORK],
		["no answer in time", TIMEOUT],
		["an answer the client cannot read", UNREADABLE],
	])("%s keeps the dialog open with its values", (_name, error) => {
		expect(readBudgetWriteError(error)).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});

	test.each([500, 502, 503])(
		"a %i keeps the dialog open with the save message, not the server's",
		(status) => {
			expect(
				readBudgetWriteError(http(status, "internal", { message: "Boom" })),
			).toEqual({
				kind: "form",
				message: SAVE_FAILED,
			});
		},
	);

	test("an error envelope without a code is the save message", () => {
		expect(readBudgetWriteError(http(400, null, { message: "Bad" }))).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});

	test("a refusal with a code but no words is the save message", () => {
		expect(readBudgetWriteError(http(400, "bad_request"))).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});

	test.each([
		["a 401", http(401, "unauthenticated", { message: "Log in" })],
		["profile_required", http(403, "profile_required", { message: "Set up" })],
	])("%s is handled by the app", (_name, error) => {
		expect(readBudgetWriteError(error)).toEqual({ kind: "handled" });
	});

	// BR-F04-23
	test("a version conflict carries the Budget as it is now, for the conflict view", () => {
		const error = http(409, "version_conflict", {
			details: { current: CURRENT },
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "conflict",
			current: CURRENT,
		});
	});

	// Flow 7.1
	test("budget_exists carries the existing Budget, which opens in Change limit", () => {
		const error = http(409, "budget_exists", {
			message: "A Budget for this category already exists.",
			details: { current: CURRENT },
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "exists",
			current: CURRENT,
		});
	});

	test.each(NOT_A_BUDGET)(
		"a version conflict whose current Budget is %s shows the server's message",
		(_name, current) => {
			const error = http(409, "version_conflict", {
				message: "This Budget was changed on another device.",
				details: { current },
			});
			expect(readBudgetWriteError(error)).toEqual({
				kind: "form",
				message: "This Budget was changed on another device.",
			});
		},
	);

	test.each(NOT_A_BUDGET)(
		"budget_exists whose current Budget is %s shows the server's message",
		(_name, current) => {
			const error = http(409, "budget_exists", {
				message: "A Budget for this category already exists.",
				details: { current },
			});
			expect(readBudgetWriteError(error)).toEqual({
				kind: "form",
				message: "A Budget for this category already exists.",
			});
		},
	);

	test("a current Budget under another code is no conflict", () => {
		const error = http(409, "id_conflict", {
			message: "Try again.",
			details: { current: CURRENT },
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "form",
			message: "Try again.",
		});
	});

	test("a 404 says the Budget was deleted on another device", () => {
		expect(
			readBudgetWriteError(http(404, "not_found", { message: "Not found" })),
		).toEqual({
			kind: "gone",
			message: GONE,
		});
	});

	test.each([
		["category", "Choose a category.", "category"],
		["limitMinor", "Enter a limit.", "limitMinor"],
		["from", "Choose a month from Nov 2023 to Nov 2027.", "month"],
		["month", "Choose a month from Nov 2023 to Nov 2027.", "month"],
	])("a 422 on %s shows under the dialog's %s field", (path, text, field) => {
		const error = http(422, "validation_failed", { fields: { [path]: text } });
		expect(readBudgetWriteError(error)).toEqual({
			kind: "fields",
			fields: { [field]: text },
			message: null,
		});
	});

	// BR-F04-21
	test("a stop that would remove every month shows under the month", () => {
		const text = "This would remove every month. Delete the Budget instead.";
		const error = http(422, "validation_failed", { fields: { from: text } });
		expect(readBudgetWriteError(error)).toEqual({
			kind: "fields",
			fields: { month: text },
			message: null,
		});
	});

	test("several fields each keep their message", () => {
		const error = http(422, "validation_failed", {
			fields: { category: "Choose a category.", limitMinor: "Enter a limit." },
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "fields",
			fields: { category: "Choose a category.", limitMinor: "Enter a limit." },
			message: null,
		});
	});

	test("a path with no field becomes the dialog's line beside the field messages", () => {
		const error = http(422, "validation_failed", {
			fields: {
				currency: "Use your profile currency.",
				limitMinor: "Enter a limit.",
			},
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "fields",
			fields: { limitMinor: "Enter a limit." },
			message: "Use your profile currency.",
		});
	});

	test("with only paths that have no field, the first is the dialog's line", () => {
		const error = http(422, "validation_failed", {
			fields: {
				id: "Use a UUIDv7.",
				"schedule.0.from": "Use a month as YYYY-MM.",
			},
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "form",
			message: "Use a UUIDv7.",
		});
	});

	test("when from and month both have a message, the month field keeps the first", () => {
		const error = http(422, "validation_failed", {
			fields: { from: "First.", month: "Second." },
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "fields",
			fields: { month: "First." },
			message: null,
		});
	});

	test("a 422 with no field messages shows its message", () => {
		const error = http(422, "currency_mismatch", {
			message: "Your currency changed. Reload to continue.",
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "form",
			message: "Your currency changed. Reload to continue.",
		});
	});

	test("a 429 shows the server's words", () => {
		const error = http(429, "rate_limited", {
			message: "Too many changes. Wait a minute.",
		});
		expect(readBudgetWriteError(error)).toEqual({
			kind: "form",
			message: "Too many changes. Wait a minute.",
		});
	});

	test("an error that is not an API error is a bug, and is thrown on", () => {
		const bug = new TypeError("x is undefined");
		expect(() => readBudgetWriteError(bug)).toThrow(bug);
		expect(() => readBudgetWriteError("text")).toThrow();
	});
});

describe("readBudgetDeleteRefusal (BR-F04-06)", () => {
	test("an error that is not an API error is thrown on", () => {
		expect(() => readBudgetDeleteRefusal(new Error("bug"))).toThrow("bug");
	});

	test("a refused delete is the dialog's own line, in the delete words", () => {
		expect(readBudgetDeleteRefusal(NETWORK)).toEqual({
			kind: "form",
			message: DELETE_FAILED,
		});
	});

	test("a 409 is the conflict view and a 401 is the app's, as for any write", () => {
		expect(
			readBudgetDeleteRefusal(
				http(409, "version_conflict", { details: { current: CURRENT } }),
			),
		).toEqual({ kind: "conflict", current: CURRENT });
		expect(readBudgetDeleteRefusal(http(401, "unauthenticated"))).toEqual({
			kind: "handled",
		});
	});
});

describe("readBudgetDeleteError (BR-F04-06, section 8)", () => {
	test.each([
		["no answer", NETWORK],
		["no answer in time", TIMEOUT],
		["an answer the client cannot read", UNREADABLE],
		["a 500", http(500, "internal", { message: "Boom" })],
		["a refusal with no words", http(400, "bad_request")],
	])("%s keeps the confirmation open with the delete message", (_name, error) => {
		expect(readBudgetDeleteError(error)).toEqual({
			kind: "refused",
			message: DELETE_FAILED,
		});
	});

	test("a version conflict carries the Budget as it is now", () => {
		const error = http(409, "version_conflict", {
			details: { current: CURRENT },
		});
		expect(readBudgetDeleteError(error)).toEqual({
			kind: "conflict",
			current: CURRENT,
		});
	});

	test("a version conflict without a readable Budget shows the server's message", () => {
		const error = http(409, "version_conflict", {
			message: "Changed elsewhere.",
			details: { current: null },
		});
		expect(readBudgetDeleteError(error)).toEqual({
			kind: "refused",
			message: "Changed elsewhere.",
		});
	});

	test("a refusal shows its first field message before its message", () => {
		const error = http(422, "validation_failed", {
			message: "Check the request.",
			fields: { body: "Send an empty body." },
		});
		expect(readBudgetDeleteError(error)).toEqual({
			kind: "refused",
			message: "Send an empty body.",
		});
	});

	test.each([
		["a 401", http(401, "unauthenticated")],
		["profile_required", http(403, "profile_required")],
	])("%s is handled by the app", (_name, error) => {
		expect(readBudgetDeleteError(error)).toEqual({ kind: "handled" });
	});

	test("an error that is not an API error is thrown on", () => {
		expect(() => readBudgetDeleteError(new Error("bug"))).toThrow("bug");
	});
});

describe("readBudgetNoticeError (BR-F04-29)", () => {
	test.each([
		["no answer", NETWORK],
		["no answer in time", TIMEOUT],
		["an answer the client cannot read", UNREADABLE],
		["a 500", http(500, "internal", { message: "Boom" })],
		["a refusal with no words", http(400, "bad_request")],
	])(
		"%s leaves the Budget as it is, with the save message in the notice",
		(_name, error) => {
			expect(readBudgetNoticeError(error)).toEqual({
				kind: "failed",
				message: NOTICE_FAILED,
			});
		},
	);

	test("a 404 says the Budget was deleted on another device, and the page reads again", () => {
		expect(readBudgetNoticeError(http(404, "not_found"))).toEqual({
			kind: "gone",
			message: GONE,
		});
	});

	test("a version conflict opens the conflict view", () => {
		const error = http(409, "version_conflict", {
			details: { current: CURRENT },
		});
		expect(readBudgetNoticeError(error)).toEqual({
			kind: "conflict",
			current: CURRENT,
		});
	});

	test("a restoring create that meets a Budget made in the meantime opens the conflict view with it", () => {
		const error = http(409, "budget_exists", { details: { current: CURRENT } });
		expect(readBudgetNoticeError(error)).toEqual({
			kind: "conflict",
			current: CURRENT,
		});
	});

	test.each(NOT_A_BUDGET)(
		"a conflict whose current Budget is %s shows the server's message",
		(_name, current) => {
			const error = http(409, "version_conflict", {
				message: "Changed elsewhere.",
				details: { current },
			});
			expect(readBudgetNoticeError(error)).toEqual({
				kind: "failed",
				message: "Changed elsewhere.",
			});
		},
	);

	test("a 422 shows its first field message", () => {
		const error = http(422, "validation_failed", {
			fields: { schedule: "A Budget needs at least one month with a limit." },
		});
		expect(readBudgetNoticeError(error)).toEqual({
			kind: "failed",
			message: "A Budget needs at least one month with a limit.",
		});
	});

	test.each([
		["a 401", http(401, "unauthenticated")],
		["profile_required", http(403, "profile_required")],
	])("%s is handled by the app", (_name, error) => {
		expect(readBudgetNoticeError(error)).toEqual({ kind: "handled" });
	});

	test("an error that is not an API error is thrown on", () => {
		expect(() => readBudgetNoticeError(new Error("bug"))).toThrow("bug");
	});
});
