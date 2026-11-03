import { describe, expect, test } from "vitest";

import { ApiRequestError } from "@/lib/api/client";
import {
	DIALOG_FIELDS,
	readDeleteError,
	readViewError,
	readWriteError,
} from "../write-errors";
import { row } from "./fixtures";

const CREATE = { mode: "create", dateLocale: "en-IN", today: "2026-11-02" } as const;
const EDIT = { ...CREATE, mode: "edit" } as const;

const SAVE_FAILED = "Your change wasn't saved. Try again.";
const DELETE_FAILED = "Couldn't delete. Check your connection and try again.";

/** An error answer as `apiFetch` throws it. */
function http(
	status: number,
	code: string | null,
	{
		message = "",
		fields = {},
		details = {},
	}: {
		message?: string;
		fields?: Record<string, string>;
		details?: Record<string, unknown>;
	} = {},
) {
	return new ApiRequestError("http", { status, code, message, fields, details });
}

const view = {
	id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02",
	name: "Food last month",
	filter: { range: "last_month" as const, cat: ["food" as const] },
	sort: "date" as const,
	dir: "desc" as const,
	group: "day" as const,
	version: 2,
	createdAt: "2026-11-02T06:30:00.000Z",
	updatedAt: "2026-11-02T06:40:00.000Z",
	currency: "INR" as const,
};

describe("DIALOG_FIELDS", () => {
	test("are the dialog's fields (BR-F03-48), by their body paths", () => {
		expect(DIALOG_FIELDS).toEqual([
			"type",
			"amountMinor",
			"goalId",
			"payee",
			"category",
			"occurredOn",
			"occurredAt",
			"description",
			"note",
		]);
	});
});

describe("readWriteError: no answer", () => {
	test.each([
		["no answer", new ApiRequestError("network")],
		["no answer in time", new ApiRequestError("timeout")],
	])(
		"%s keeps the dialog open with the save message (flow 7.1)",
		(_name, error) => {
			expect(readWriteError(error, CREATE)).toEqual({
				kind: "form",
				message: SAVE_FAILED,
			});
			expect(readWriteError(error, EDIT)).toEqual({
				kind: "form",
				message: SAVE_FAILED,
			});
		},
	);

	test("an http error without a status, an unreadable answer, gives the save message", () => {
		expect(readWriteError(new ApiRequestError("http"), CREATE)).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});
});

describe("readWriteError: answered by the app", () => {
	test("a 401 is the session banner's, which apiFetch has shown", () => {
		expect(readWriteError(http(401, "unauthenticated"), CREATE)).toEqual({
			kind: "handled",
		});
	});

	test("profile_required is onboarding's", () => {
		expect(readWriteError(http(403, "profile_required"), EDIT)).toEqual({
			kind: "handled",
		});
	});
});

describe("readWriteError: 422 with field messages (flow 7.1 step 5)", () => {
	test("each message goes under its field", () => {
		const error = http(422, "validation_failed", {
			message: "Some fields need attention.",
			fields: {
				payee: "Enter who you paid, or who paid you.",
				category: "Choose a category.",
			},
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "fields",
			fields: {
				payee: "Enter who you paid, or who paid you.",
				category: "Choose a category.",
			},
			message: null,
		});
	});

	test.each(DIALOG_FIELDS)("a message on %s stays under that field", (field) => {
		const error = http(422, "validation_failed", { fields: { [field]: "m" } });
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "fields",
			fields: { [field]: "m" },
			message: null,
		});
	});

	test("a message on a path the dialog has no field for becomes its own line", () => {
		const error = http(422, "validation_failed", {
			fields: {
				id: "This item's time is in the future. Check your device's clock.",
			},
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "form",
			message: "This item's time is in the future. Check your device's clock.",
		});
	});

	test("field messages and a fieldless one come together", () => {
		const error = http(422, "validation_failed", {
			fields: {
				currency: "Use a supported currency.",
				payee: "Use 80 characters or fewer.",
			},
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "fields",
			fields: { payee: "Use 80 characters or fewer." },
			message: "Use a supported currency.",
		});
	});

	test("of several fieldless messages, the first is the line", () => {
		const error = http(422, "validation_failed", {
			fields: { id: "first", createdAt: "second" },
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "form",
			message: "first",
		});
	});

	test("the recording time ahead of the server is the dialog's line (TIME-7)", () => {
		const error = http(422, "date_out_of_window", {
			fields: { createdAt: "The recording time can't be in the future." },
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "form",
			message: "The recording time can't be in the future.",
		});
	});

	test("the Goal floor's message stays under the amount (flow 7.10)", () => {
		const error = http(422, "validation_failed", {
			fields: {
				amountMinor: "You can withdraw at most 5,000.00 from Vacation.",
			},
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "fields",
			fields: {
				amountMinor: "You can withdraw at most 5,000.00 from Vacation.",
			},
			message: null,
		});
	});
});

describe("readWriteError: the entry window (BR-F03-08, D-499)", () => {
	const outOfWindow = (text: string, details: Record<string, unknown>) =>
		http(422, "date_out_of_window", { fields: { occurredOn: text }, details });

	test("a create keeps the server's message", () => {
		const error = outOfWindow("Choose today or one of the 10 days before.", {
			firstOn: "2026-10-23",
			lastOn: "2026-11-02",
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "fields",
			fields: { occurredOn: "Choose today or one of the 10 days before." },
			message: null,
		});
	});

	// F03 section 5, entry window
	test("an edit names the row's own window from the details", () => {
		const error = outOfWindow(
			"Choose a date in this Transaction's entry window.",
			{
				firstOn: "2026-10-06",
				lastOn: "2026-10-16",
			},
		);
		expect(readWriteError(error, EDIT)).toEqual({
			kind: "fields",
			fields: { occurredOn: "Choose a date from 6 Oct to 16 Oct." },
			message: null,
		});
	});

	test("a window in another year names the year", () => {
		const error = outOfWindow("x", {
			firstOn: "2025-12-27",
			lastOn: "2026-01-06",
		});
		expect(
			readWriteError(error, { ...EDIT, today: "2026-03-01" }),
		).toMatchObject({
			fields: { occurredOn: "Choose a date from 27 Dec 2025 to 6 Jan." },
		});
	});

	test("day order follows the date locale", () => {
		const error = outOfWindow("x", {
			firstOn: "2026-10-06",
			lastOn: "2026-10-16",
		});
		expect(
			readWriteError(error, { ...EDIT, dateLocale: "en-US" }),
		).toMatchObject({
			fields: { occurredOn: "Choose a date from Oct 6 to Oct 16." },
		});
	});

	test.each([
		["no details", {}],
		["one end", { firstOn: "2026-10-06" }],
		["numbers", { firstOn: 1, lastOn: 2 }],
		["dates that do not exist", { firstOn: "2026-02-30", lastOn: "2026-03-01" }],
		["text", { firstOn: "yesterday", lastOn: "today" }],
	])("an edit's window with %s keeps the server's message", (_name, details) => {
		const error = outOfWindow(
			"Choose a date in this Transaction's entry window.",
			details,
		);
		expect(readWriteError(error, EDIT)).toMatchObject({
			fields: {
				occurredOn: "Choose a date in this Transaction's entry window.",
			},
		});
	});

	test("only date_out_of_window gets the dated message", () => {
		const error = http(422, "validation_failed", {
			fields: { occurredOn: "The date doesn't match the time." },
			details: { firstOn: "2026-10-06", lastOn: "2026-10-16" },
		});
		expect(readWriteError(error, EDIT)).toMatchObject({
			fields: { occurredOn: "The date doesn't match the time." },
		});
	});
});

describe("readWriteError: other refusals", () => {
	test("currency_mismatch shows its message as the dialog's line", () => {
		const error = http(422, "currency_mismatch", {
			message: "Not saved: your currency changed after this was made.",
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "form",
			message: "Not saved: your currency changed after this was made.",
		});
	});

	test("a 422 without fields shows its message", () => {
		const error = http(422, "goal_read_only", {
			message: "Vacation is completed, so its Transactions can't be changed.",
		});
		expect(readWriteError(error, EDIT)).toEqual({
			kind: "form",
			message: "Vacation is completed, so its Transactions can't be changed.",
		});
	});

	test("a 429 shows the wait message", () => {
		const error = http(429, "rate_limited", {
			message: "Too many attempts. Wait a few seconds and try again.",
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "form",
			message: "Too many attempts. Wait a few seconds and try again.",
		});
	});

	test("an id_conflict shows its message", () => {
		const error = http(409, "id_conflict", {
			message: "This could not be created. Try again.",
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "form",
			message: "This could not be created. Try again.",
		});
	});

	test.each([500, 502, 503, 504])(
		"a %i gives the save message, never the server's",
		(status) => {
			const error = http(status, "internal", {
				message:
					"Something went wrong on our side. Your change was not saved.",
			});
			expect(readWriteError(error, CREATE)).toEqual({
				kind: "form",
				message: SAVE_FAILED,
			});
		},
	);

	test("an answer without an envelope gives the save message", () => {
		expect(readWriteError(http(502, null), CREATE)).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
		expect(readWriteError(http(400, null), CREATE)).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});

	test("an error code with an empty message gives the save message", () => {
		expect(readWriteError(http(400, "bad_request"), CREATE)).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});
});

describe("readWriteError: 404 and 409", () => {
	// BR-F03-25
	test("a 404 on an edit means the row was deleted elsewhere", () => {
		expect(readWriteError(http(404, "not_found"), EDIT)).toEqual({
			kind: "gone",
			message: "This Transaction was deleted on another device.",
		});
	});

	test("a 404 on a create is a plain refusal", () => {
		const error = http(404, "not_found", {
			message: "We could not find that. It may have been deleted.",
		});
		expect(readWriteError(error, CREATE)).toEqual({
			kind: "form",
			message: "We could not find that. It may have been deleted.",
		});
	});

	// AC-F03-19, flow 7.4
	test("a version_conflict opens the conflict view with the current row", () => {
		const current = row({ amountMinor: 310000, version: 2 });
		const error = http(409, "version_conflict", {
			message: "This was changed on another device.",
			details: { current },
		});
		expect(readWriteError(error, EDIT)).toEqual({ kind: "conflict", current });
	});

	test.each([
		["no current row", {}],
		["a current that is not an object", { current: "x" }],
		["a current of null", { current: null }],
		["a current without an id", { current: { version: 2 } }],
		["a current without a version", { current: { id: "x" } }],
		["a version that is text", { current: { id: "x", version: "2" } }],
	])("a version_conflict with %s shows its message instead", (_name, details) => {
		const error = http(409, "version_conflict", {
			message: "This was changed on another device.",
			details,
		});
		expect(readWriteError(error, EDIT)).toEqual({
			kind: "form",
			message: "This was changed on another device.",
		});
	});
});

describe("readWriteError: not an API error", () => {
	test.each([new TypeError("bug"), new Error("bug"), "bug", null])(
		"%s is a bug and is thrown on",
		(error) => {
			expect(() => readWriteError(error, CREATE)).toThrow();
		},
	);

	test("the same error object is thrown on", () => {
		const bug = new TypeError("bug");
		expect(() => readWriteError(bug, CREATE)).toThrow(bug);
	});
});

describe("readDeleteError (BR-F03-26)", () => {
	test.each([
		["no answer", new ApiRequestError("network")],
		["no answer in time", new ApiRequestError("timeout")],
		["no status", new ApiRequestError("http")],
	])("%s brings the row back with the connection message", (_name, error) => {
		expect(readDeleteError(error)).toEqual({
			kind: "refused",
			message: DELETE_FAILED,
		});
	});

	// AC-F03-30
	test("a version_conflict opens the conflict view", () => {
		const current = row({ version: 3 });
		expect(
			readDeleteError(http(409, "version_conflict", { details: { current } })),
		).toEqual({ kind: "conflict", current });
	});

	test("a version_conflict without a row is a refusal with its message", () => {
		expect(
			readDeleteError(
				http(409, "version_conflict", {
					message: "This was changed on another device.",
				}),
			),
		).toEqual({
			kind: "refused",
			message: "This was changed on another device.",
		});
	});

	test("the Goal floor's field message is the reason", () => {
		const error = http(422, "validation_failed", {
			message: "Some fields need attention.",
			fields: {
				amountMinor:
					"This would take Vacation below zero. Change or remove a withdrawal first.",
			},
		});
		expect(readDeleteError(error)).toEqual({
			kind: "refused",
			message:
				"This would take Vacation below zero. Change or remove a withdrawal first.",
		});
	});

	test("a read-only Goal's message is the reason", () => {
		const error = http(422, "goal_read_only", {
			message: "Vacation is completed, so its Transactions can't be changed.",
		});
		expect(readDeleteError(error)).toEqual({
			kind: "refused",
			message: "Vacation is completed, so its Transactions can't be changed.",
		});
	});

	test.each([500, 503])(
		"a %i brings the row back with the connection message",
		(status) => {
			expect(
				readDeleteError(
					http(status, "internal", { message: "Something went wrong." }),
				),
			).toEqual({ kind: "refused", message: DELETE_FAILED });
		},
	);

	test("a refusal without any message gives the connection message", () => {
		expect(readDeleteError(http(400, null))).toEqual({
			kind: "refused",
			message: DELETE_FAILED,
		});
	});

	test("a 401 and profile_required are the app's", () => {
		expect(readDeleteError(http(401, "unauthenticated"))).toEqual({
			kind: "handled",
		});
		expect(readDeleteError(http(403, "profile_required"))).toEqual({
			kind: "handled",
		});
	});

	test("a bug is thrown on", () => {
		expect(() => readDeleteError(new Error("bug"))).toThrow("bug");
	});
});

describe("readViewError (AC-F03-55)", () => {
	test("a version_conflict says the view changed, with the current view", () => {
		expect(
			readViewError(
				http(409, "version_conflict", { details: { current: view } }),
			),
		).toEqual({
			kind: "stale",
			message: "This view changed on another device. Try again.",
			current: view,
		});
	});

	test("a version_conflict without a usable view still says it changed", () => {
		expect(readViewError(http(409, "version_conflict"))).toEqual({
			kind: "stale",
			message: "This view changed on another device. Try again.",
			current: null,
		});
	});

	test("a 404 says the view was deleted", () => {
		expect(readViewError(http(404, "not_found"))).toEqual({
			kind: "stale",
			message: "This view was deleted on another device.",
			current: null,
		});
	});

	// BR-F03-67: Save as view tries the next suffix on this one
	test("a 422 on the name is its own outcome", () => {
		const error = http(422, "validation_failed", {
			fields: { name: "You already have a view with this name." },
		});
		expect(readViewError(error)).toEqual({
			kind: "name",
			message: "You already have a view with this name.",
		});
	});

	test("the name wins over other fields' messages", () => {
		const error = http(422, "validation_failed", {
			fields: { "filter.cat": "Choose a category.", name: "Enter a name." },
		});
		expect(readViewError(error)).toEqual({
			kind: "name",
			message: "Enter a name.",
		});
	});

	test("the 20-view limit shows its message", () => {
		expect(
			readViewError(
				http(422, "limit_reached", {
					message: "You have 20 views. Delete one to save another.",
				}),
			),
		).toEqual({
			kind: "form",
			message: "You have 20 views. Delete one to save another.",
		});
	});

	test("a filter's field message is the line", () => {
		expect(
			readViewError(
				http(422, "validation_failed", {
					fields: {
						"filter.q": "Type at least 3 characters, or an amount.",
					},
				}),
			),
		).toEqual({
			kind: "form",
			message: "Type at least 3 characters, or an amount.",
		});
	});

	test("currency_mismatch shows its message", () => {
		expect(
			readViewError(
				http(422, "currency_mismatch", {
					message: "Not saved: your currency changed after this was made.",
				}),
			),
		).toEqual({
			kind: "form",
			message: "Not saved: your currency changed after this was made.",
		});
	});

	test.each([
		["no answer", new ApiRequestError("network")],
		["no answer in time", new ApiRequestError("timeout")],
		["a 500", http(500, "internal", { message: "Something went wrong." })],
		["no message", http(400, null)],
	])("%s gives the save message", (_name, error) => {
		expect(readViewError(error)).toEqual({ kind: "form", message: SAVE_FAILED });
	});

	test("a 401 and profile_required are the app's", () => {
		expect(readViewError(http(401, "unauthenticated"))).toEqual({
			kind: "handled",
		});
		expect(readViewError(http(403, "profile_required"))).toEqual({
			kind: "handled",
		});
	});

	test("a bug is thrown on", () => {
		expect(() => readViewError(new RangeError("bug"))).toThrow("bug");
	});
});
