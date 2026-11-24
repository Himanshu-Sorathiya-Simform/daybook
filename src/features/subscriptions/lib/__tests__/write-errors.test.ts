import { describe, expect, test } from "vitest";

import { ApiRequestError } from "@/lib/api/client";
import {
	readSubscriptionDeleteError,
	readSubscriptionDeleteRefusal,
	readSubscriptionNoticeError,
	readSubscriptionWriteError,
} from "../write-errors";
import { subscriptionAnswer } from "./fixtures";

// F05 section 8, word for word.
const SAVE_FAILED =
	"The Subscription could not be saved. Check your connection and try again. Your changes are still here.";
const DELETE_FAILED =
	"The Subscription could not be deleted. Check your connection and try again.";
const NOTICE_FAILED =
	"The Subscription could not be saved. Check your connection and try again.";
const GONE = "This Subscription was deleted on another device.";
const CANNOT_UNDO = "This change can't be undone any more.";

const CURRENT = subscriptionAnswer("netflix", { version: 3 });

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

/** A 409 holding `current`; with no argument, a valid Subscription. An explicit `undefined`
 * is a missing one. */
const conflict = (...given: [current?: unknown]) => {
	const current = given.length === 0 ? CURRENT : given[0];
	return http(409, "version_conflict", {
		message: "This Subscription changed on another device.",
		details: current === undefined ? {} : { current },
	});
};

const NETWORK = new ApiRequestError("network");
const TIMEOUT = new ApiRequestError("timeout");
const UNREADABLE = new ApiRequestError("http", { status: 200 });

/** Every way `details.current` can fail to be a Subscription. */
const NOT_A_SUBSCRIPTION: [string, unknown][] = [
	["missing", undefined],
	["null", null],
	["a string", "netflix"],
	["without an id", { ...CURRENT, id: 7 }],
	["without a version", { ...CURRENT, version: "3" }],
	["without a name", { ...CURRENT, name: null }],
	["without a skips list", { ...CURRENT, skips: {} }],
];

describe("the messages are F05 section 8's", () => {
	test("a save that fails keeps the dialog open with the changes still there", () => {
		expect(readSubscriptionWriteError(NETWORK)).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});

	test("a delete that fails says to check the connection", () => {
		expect(readSubscriptionDeleteError(NETWORK)).toEqual({
			kind: "refused",
			message: DELETE_FAILED,
		});
	});

	test("a notice that fails says the same without the dialog's last sentence", () => {
		expect(readSubscriptionNoticeError(NETWORK, { undo: true })).toEqual({
			kind: "failed",
			message: NOTICE_FAILED,
		});
	});
});

describe("readSubscriptionWriteError (flows 7.1 to 7.8)", () => {
	test("an error that is not an API error is a bug and is thrown on", () => {
		const bug = new TypeError("x is undefined");
		expect(() => readSubscriptionWriteError(bug)).toThrow(bug);
		expect(() => readSubscriptionWriteError("text")).toThrow();
	});

	test.each([
		["no answer", NETWORK],
		["no answer in time", TIMEOUT],
		["an answer the client cannot read", UNREADABLE],
		["a proxy's page with no code", http(502, null, { message: "Bad gateway" })],
		["a 500", http(500, "internal", { message: "Boom" })],
		["a 503 with words", http(503, "unavailable", { message: "Try later" })],
	])("%s keeps the dialog open with its own line", (_what, error) => {
		expect(readSubscriptionWriteError(error)).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});

	test("a 401 and profile_required are the app's to answer", () => {
		expect(readSubscriptionWriteError(http(401, "unauthenticated"))).toEqual({
			kind: "handled",
		});
		expect(readSubscriptionWriteError(http(403, "profile_required"))).toEqual({
			kind: "handled",
		});
	});

	test("a 404 means it was deleted on another device", () => {
		expect(readSubscriptionWriteError(http(404, "not_found"))).toEqual({
			kind: "gone",
			message: GONE,
		});
	});

	// AC-F05-14
	test("a 409 version_conflict opens the conflict view with the saved Subscription", () => {
		expect(readSubscriptionWriteError(conflict())).toEqual({
			kind: "conflict",
			current: CURRENT,
		});
	});

	test.each(NOT_A_SUBSCRIPTION)(
		"a 409 whose current is %s shows its message instead",
		(_why, current) => {
			expect(readSubscriptionWriteError(conflict(current))).toEqual({
				kind: "form",
				message: "This Subscription changed on another device.",
			});
		},
	);

	test("another 409, such as id_conflict, shows its message", () => {
		expect(
			readSubscriptionWriteError(
				http(409, "id_conflict", { message: "That id is taken." }),
			),
		).toEqual({ kind: "form", message: "That id is taken." });
	});

	describe("a 422 puts each message under its field", () => {
		test.each([
			["name", "name", "Enter a name, like Netflix or Rent."],
			["amountMinor", "amountMinor", "Enter an amount above zero."],
			["cadence", "cadence", "Choose how often it repeats."],
			["cadence.every", "cadence", "Enter how many weeks, from 1 to 52."],
			["cadence.unit", "cadence", "Choose how often it repeats."],
			["category", "category", "Choose a category."],
			[
				"startDate",
				"startDate",
				"Choose a date from 2 Nov 2016 to 2 Nov 2027.",
			],
			["note", "note", "Use 500 characters or fewer."],
			["endDate", "endDate", "The end date can't be before the start date."],
			["pause", "pause", "Choose a date with a charge to pause from."],
			["pause.from", "pause", "Choose a date with a charge to pause from."],
			["pause.until", "pause", "Choose a date after 5 Nov."],
			["skipDueOn", "skipDueOn", "Choose a date with a charge to skip."],
		])("%s goes to the %s field", (path, field, message) => {
			expect(
				readSubscriptionWriteError(
					http(422, "validation_failed", { fields: { [path]: message } }),
				),
			).toEqual({
				kind: "fields",
				fields: { [field]: message },
				message: null,
			});
		});

		test("several fields each keep their own message", () => {
			const outcome = readSubscriptionWriteError(
				http(422, "validation_failed", {
					fields: {
						name: "Enter a name, like Netflix or Rent.",
						amountMinor: "Enter an amount above zero.",
						category: "Choose a category.",
					},
				}),
			);
			expect(outcome).toEqual({
				kind: "fields",
				fields: {
					name: "Enter a name, like Netflix or Rent.",
					amountMinor: "Enter an amount above zero.",
					category: "Choose a category.",
				},
				message: null,
			});
		});

		test("two paths of one field keep the first message", () => {
			expect(
				readSubscriptionWriteError(
					http(422, "validation_failed", {
						fields: {
							"cadence.every": "Enter how many weeks, from 1 to 52.",
							"cadence.unit": "Choose how often it repeats.",
						},
					}),
				),
			).toEqual({
				kind: "fields",
				fields: { cadence: "Enter how many weeks, from 1 to 52." },
				message: null,
			});
		});

		test("a path with no field becomes the dialog's own line, beside the fields", () => {
			expect(
				readSubscriptionWriteError(
					http(422, "validation_failed", {
						fields: {
							name: "Enter a name, like Netflix or Rent.",
							changedAt:
								"This change is too old to apply. Discard it and make it again.",
						},
					}),
				),
			).toEqual({
				kind: "fields",
				fields: { name: "Enter a name, like Netflix or Rent." },
				message:
					"This change is too old to apply. Discard it and make it again.",
			});
		});

		test.each([
			[
				"changedAt",
				"This change is too old to apply. Discard it and make it again.",
			],
			["createdAt", "The change time can't be in the future."],
			["currency", "Not saved: your currency changed after this was made."],
			["id", "Use a UUIDv7."],
			["alsoPastCharges", "Send this with a name or category change."],
			["backfillGap", "Send this with an end date change."],
			["_body", "Send an object."],
		])(
			"only %s has no field, so it is the dialog's own line",
			(path, message) => {
				expect(
					readSubscriptionWriteError(
						http(422, "validation_failed", {
							fields: { [path]: message },
						}),
					),
				).toEqual({ kind: "form", message });
			},
		);

		test("the first line-only message is the line", () => {
			expect(
				readSubscriptionWriteError(
					http(422, "validation_failed", {
						fields: {
							changedAt: "first",
							currency: "second",
							name: "n",
						},
					}),
				),
			).toMatchObject({ message: "first" });
		});
	});

	test("a 422 with no fields shows its message, as currency_mismatch does", () => {
		expect(
			readSubscriptionWriteError(
				http(422, "currency_mismatch", {
					message: "Not saved: your currency changed after this was made.",
				}),
			),
		).toEqual({
			kind: "form",
			message: "Not saved: your currency changed after this was made.",
		});
	});

	test("a refusal with no words falls back to the save message", () => {
		expect(readSubscriptionWriteError(http(422, "validation_failed"))).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
		expect(readSubscriptionWriteError(http(429, "rate_limited"))).toEqual({
			kind: "form",
			message: SAVE_FAILED,
		});
	});

	test("a 429 and any other refusal with its own message show that message", () => {
		expect(
			readSubscriptionWriteError(
				http(429, "rate_limited", {
					message: "Too many requests. Try again soon.",
				}),
			),
		).toEqual({ kind: "form", message: "Too many requests. Try again soon." });
		expect(
			readSubscriptionWriteError(
				http(422, "idempotency_key_reused", {
					message:
						"This change conflicts with an earlier one. Discard it and try again.",
				}),
			),
		).toEqual({
			kind: "form",
			message:
				"This change conflicts with an earlier one. Discard it and try again.",
		});
	});
});

describe("readSubscriptionDeleteRefusal (BR-F05-44)", () => {
	test("an error that is not an API error is thrown on", () => {
		expect(() => readSubscriptionDeleteRefusal(new Error("bug"))).toThrow("bug");
	});

	test("a refused delete is the dialog's own line, in the delete words", () => {
		expect(readSubscriptionDeleteRefusal(NETWORK)).toEqual({
			kind: "form",
			message: DELETE_FAILED,
		});
	});

	test("a 409 is the conflict view and a 401 is the app's, as for any write", () => {
		expect(readSubscriptionDeleteRefusal(conflict())).toEqual({
			kind: "conflict",
			current: CURRENT,
		});
		expect(readSubscriptionDeleteRefusal(http(401, "unauthenticated"))).toEqual({
			kind: "handled",
		});
	});
});

describe("readSubscriptionDeleteError (BR-F05-44)", () => {
	test("an error that is not an API error is thrown on", () => {
		expect(() => readSubscriptionDeleteError(new Error("bug"))).toThrow("bug");
	});

	test.each([
		["no answer", NETWORK],
		["no answer in time", TIMEOUT],
		["an unreadable answer", UNREADABLE],
		["a 500", http(500, "internal", { message: "Boom" })],
		["a proxy's page", http(502, null, { message: "Bad gateway" })],
	])("%s leaves the confirmation open with the delete message", (_what, error) => {
		expect(readSubscriptionDeleteError(error)).toEqual({
			kind: "refused",
			message: DELETE_FAILED,
		});
	});

	test("a 401 and profile_required are the app's to answer", () => {
		expect(readSubscriptionDeleteError(http(401, "unauthenticated"))).toEqual({
			kind: "handled",
		});
		expect(readSubscriptionDeleteError(http(403, "profile_required"))).toEqual({
			kind: "handled",
		});
	});

	// AC-F05-14
	test("a 409 version_conflict opens the conflict view", () => {
		expect(readSubscriptionDeleteError(conflict())).toEqual({
			kind: "conflict",
			current: CURRENT,
		});
	});

	test.each(NOT_A_SUBSCRIPTION)(
		"a 409 whose current is %s is refused with its message",
		(_why, current) => {
			expect(readSubscriptionDeleteError(conflict(current))).toEqual({
				kind: "refused",
				message: "This Subscription changed on another device.",
			});
		},
	);

	test("a refusal with its own message shows it", () => {
		expect(
			readSubscriptionDeleteError(
				http(422, "validation_failed", {
					fields: { changedAt: "Too old." },
				}),
			),
		).toEqual({ kind: "refused", message: "Too old." });
		expect(
			readSubscriptionDeleteError(
				http(429, "rate_limited", { message: "Slow down." }),
			),
		).toEqual({ kind: "refused", message: "Slow down." });
	});

	test("a refusal with no words falls back to the delete message", () => {
		expect(readSubscriptionDeleteError(http(422, "validation_failed"))).toEqual({
			kind: "refused",
			message: DELETE_FAILED,
		});
	});
});

describe("readSubscriptionNoticeError (BR-F05-33, BR-F05-34)", () => {
	test("an error that is not an API error is thrown on", () => {
		expect(() =>
			readSubscriptionNoticeError(new Error("bug"), { undo: true }),
		).toThrow("bug");
	});

	test.each([true, false])(
		"with undo %s, no answer, no answer in time and a 5xx fail",
		(undo) => {
			for (const error of [
				NETWORK,
				TIMEOUT,
				UNREADABLE,
				http(500, "internal"),
				http(502, null),
			]) {
				expect(readSubscriptionNoticeError(error, { undo })).toEqual({
					kind: "failed",
					message: NOTICE_FAILED,
				});
			}
		},
	);

	test.each([true, false])(
		"with undo %s, a 401 and profile_required are the app's to answer",
		(undo) => {
			expect(
				readSubscriptionNoticeError(http(401, "unauthenticated"), { undo }),
			).toEqual({
				kind: "handled",
			});
			expect(
				readSubscriptionNoticeError(http(403, "profile_required"), { undo }),
			).toEqual({
				kind: "handled",
			});
		},
	);

	test.each([true, false])(
		"with undo %s, a 404 means it was deleted on another device",
		(undo) => {
			expect(
				readSubscriptionNoticeError(http(404, "not_found"), { undo }),
			).toEqual({
				kind: "gone",
				message: GONE,
			});
		},
	);

	// AC-F05-23: undo of an Add at version 2 returns 409.
	test.each([true, false])(
		"with undo %s, a 409 version_conflict opens the conflict view",
		(undo) => {
			expect(readSubscriptionNoticeError(conflict(), { undo })).toEqual({
				kind: "conflict",
				current: CURRENT,
			});
		},
	);

	test.each(NOT_A_SUBSCRIPTION)(
		"a 409 whose current is %s fails with its message",
		(_why, current) => {
			expect(
				readSubscriptionNoticeError(conflict(current), { undo: true }),
			).toEqual({
				kind: "failed",
				message: "This Subscription changed on another device.",
			});
		},
	);

	describe("an Undo that a 422 refuses", () => {
		test('reads "This change can\'t be undone any more."', () => {
			expect(
				readSubscriptionNoticeError(
					http(422, "validation_failed", {
						fields: {
							unskipDueOn:
								"This charge date has passed, so it can't be brought back.",
						},
					}),
					{ undo: true },
				),
			).toEqual({ kind: "failed", message: CANNOT_UNDO });
		});

		test("whatever the 422's code, currency_mismatch included", () => {
			for (const code of [
				"currency_mismatch",
				"idempotency_key_reused",
				"validation_failed",
			]) {
				expect(
					readSubscriptionNoticeError(
						http(422, code, { message: "Own words." }),
						{ undo: true },
					),
				).toEqual({ kind: "failed", message: CANNOT_UNDO });
			}
		});

		test("a refusal that is not a 422 keeps its own message", () => {
			expect(
				readSubscriptionNoticeError(
					http(429, "rate_limited", { message: "Slow down." }),
					{
						undo: true,
					},
				),
			).toEqual({ kind: "failed", message: "Slow down." });
			expect(
				readSubscriptionNoticeError(
					http(400, "bad_request", { message: "Bad." }),
					{ undo: true },
				),
			).toEqual({ kind: "failed", message: "Bad." });
		});
	});

	describe("a skip or Undo skip that a 422 refuses", () => {
		// BR-F05-26: Only an upcoming charge can be skipped.
		test("says why, in the server's words", () => {
			expect(
				readSubscriptionNoticeError(
					http(422, "validation_failed", {
						fields: { dueOn: "Only an upcoming charge can be skipped." },
					}),
					{ undo: false },
				),
			).toEqual({
				kind: "failed",
				message: "Only an upcoming charge can be skipped.",
			});
		});

		// BR-F05-27
		test("an Undo skip for a passed date says it cannot be brought back", () => {
			expect(
				readSubscriptionNoticeError(
					http(422, "validation_failed", {
						fields: {
							dueOn: "This charge date has passed, so it can't be brought back.",
						},
					}),
					{ undo: false },
				),
			).toEqual({
				kind: "failed",
				message: "This charge date has passed, so it can't be brought back.",
			});
		});

		// BR-F05-26: an edited charge there stays.
		test("a skip over an edited charge says it stays", () => {
			expect(
				readSubscriptionNoticeError(
					http(422, "validation_failed", {
						fields: {
							dueOn: "This charge was edited, so it stays. Delete it in Transactions to skip it.",
						},
					}),
					{ undo: false },
				),
			).toEqual({
				kind: "failed",
				message:
					"This charge was edited, so it stays. Delete it in Transactions to skip it.",
			});
		});

		test("a 422 with no words falls back to the notice message", () => {
			expect(
				readSubscriptionNoticeError(http(422, "validation_failed"), {
					undo: false,
				}),
			).toEqual({ kind: "failed", message: NOTICE_FAILED });
		});

		test("a 429 shows its message", () => {
			expect(
				readSubscriptionNoticeError(
					http(429, "rate_limited", { message: "Slow down." }),
					{
						undo: false,
					},
				),
			).toEqual({ kind: "failed", message: "Slow down." });
		});
	});
});
