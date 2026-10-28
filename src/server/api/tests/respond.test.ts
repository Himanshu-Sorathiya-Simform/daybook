// @vitest-environment node
import { describe, expect, test } from "vitest";
import { ApiError } from "../errors";
import { isReply, reply, respond, respondError, successOf } from "../respond";
import { Timing } from "../timing";

const meta = () => ({
	requestId: "0192f0c4-8a1b-7c2d-9e3f-0123456789ab",
	timing: new Timing(),
});

describe("successOf (root API-11)", () => {
	test("wraps a plain return in data with status 200", () => {
		expect(successOf({ id: "a" })).toEqual({
			status: 200,
			body: '{"data":{"id":"a"}}',
		});
	});

	test("uses a reply's status", () => {
		expect(successOf(reply({ id: "a" }, { status: 201 }))).toEqual({
			status: 201,
			body: '{"data":{"id":"a"}}',
		});
	});

	test("defaults a reply to 200", () => {
		expect(successOf(reply([1]))).toEqual({ status: 200, body: '{"data":[1]}' });
	});

	test("sends no body for a 204", () => {
		expect(successOf(reply(null, { status: 204 }))).toEqual({
			status: 204,
			body: null,
		});
	});

	test("keeps null, false and zero as data", () => {
		expect(successOf(null).body).toBe('{"data":null}');
		expect(successOf(false).body).toBe('{"data":false}');
		expect(successOf(0).body).toBe('{"data":0}');
	});

	test("writes a Date as ISO UTC (API-6)", () => {
		expect(successOf({ at: new Date("2026-11-02T06:30:00.000Z") }).body).toBe(
			'{"data":{"at":"2026-11-02T06:30:00.000Z"}}',
		);
	});

	test("does not mistake a data object for a reply", () => {
		expect(isReply({ data: 1, status: 201 })).toBe(false);
		expect(successOf({ data: 1, status: 201 })).toEqual({
			status: 200,
			body: '{"data":{"data":1,"status":201}}',
		});
	});
});

describe("respond", () => {
	test("carries the request id, Server-Timing and the JSON type", async () => {
		const response = respond(201, '{"data":1}', meta());
		expect(response.status).toBe(201);
		expect(response.headers.get("x-request-id")).toBe(meta().requestId);
		expect(response.headers.get("server-timing")).toMatch(
			/^db;dur=\d+, app;dur=\d+$/,
		);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(await response.text()).toBe('{"data":1}');
	});

	test("sends a 204 with no body and no content type", async () => {
		const response = respond(204, null, meta());
		expect(response.headers.get("content-type")).toBeNull();
		expect(await response.text()).toBe("");
		expect(response.headers.get("x-request-id")).toBe(meta().requestId);
	});
});

describe("respondError (API-9)", () => {
	test("answers with the envelope, its status and the request id", async () => {
		const response = respondError(
			new ApiError("validation_failed", { fields: { payee: "Required" } }),
			meta(),
			{ read: false },
		);
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({
			error: {
				code: "validation_failed",
				message: "Some fields need attention.",
				fields: { payee: "Required" },
				details: {},
				requestId: meta().requestId,
			},
		});
		expect(response.headers.get("server-timing")).toMatch(/^db;dur=/);
	});

	test("a read's internal error says it could not be loaded", async () => {
		const response = respondError(new ApiError("internal"), meta(), {
			read: true,
		});
		expect((await response.json()).error.message).toBe(
			"This could not be loaded.",
		);
	});

	test("a write's internal error says nothing was saved", async () => {
		const response = respondError(new ApiError("internal"), meta(), {
			read: false,
		});
		expect((await response.json()).error.message).toBe(
			"Something went wrong on our side. Your change was not saved.",
		);
	});
});
