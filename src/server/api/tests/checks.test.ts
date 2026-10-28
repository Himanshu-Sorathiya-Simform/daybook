// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
	BODY_LIMIT,
	checkOrigin,
	isJsonMediaType,
	isMutation,
	parseIfMatch,
	queuePending,
	readBody,
	requestIdOf,
} from "../checks";
import { ApiError } from "../errors";
import { isUuidV7 } from "@/lib/ids";

const V7 = "0192f0c4-8a1b-7c2d-9e3f-0123456789ab";

/** The code of the ApiError `fn` throws, or a failure if it does not throw one. */
async function codeOf(fn: () => unknown): Promise<string> {
	try {
		await fn();
	} catch (error) {
		if (error instanceof ApiError) return error.code;
		throw error;
	}
	throw new Error("Expected an ApiError");
}

describe("isMutation", () => {
	test.each(["POST", "PUT", "PATCH", "DELETE", "post"])(
		"%s is a mutation",
		(method) => {
			expect(isMutation(method)).toBe(true);
		},
	);

	test.each(["GET", "HEAD", "OPTIONS"])("%s is not", (method) => {
		expect(isMutation(method)).toBe(false);
	});
});

describe("isJsonMediaType", () => {
	test.each([
		"application/json",
		"application/json; charset=utf-8",
		"Application/JSON",
		"application/json ;charset=UTF-8",
	])("accepts %s", (type) => {
		expect(isJsonMediaType(type)).toBe(true);
	});

	test.each([
		null,
		"",
		"text/plain",
		"application/x-www-form-urlencoded",
		"multipart/form-data; boundary=x",
		"application/jsonp",
		"application/json-patch+json",
		"text/json",
	])("refuses %s", (type) => {
		expect(isJsonMediaType(type)).toBe(false);
	});
});

describe("readBody", () => {
	const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
		new Request("http://localhost:3000/api/x", {
			method: "POST",
			body,
			headers,
		});

	test("reads the body as text", async () => {
		expect(await readBody(post('{"a":"₹"}'))).toBe('{"a":"₹"}');
	});

	test("reads a missing body as empty", async () => {
		expect(await readBody(post(null))).toBe("");
	});

	test("accepts exactly the limit", async () => {
		expect(await readBody(post("a".repeat(BODY_LIMIT)))).toHaveLength(
			BODY_LIMIT,
		);
	});

	test("refuses one byte over the limit with 413", async () => {
		expect(await codeOf(() => readBody(post("a".repeat(BODY_LIMIT + 1))))).toBe(
			"payload_too_large",
		);
	});

	test("counts bytes, not characters", async () => {
		// "₹" is three bytes in UTF-8.
		const body = "₹".repeat(Math.floor(BODY_LIMIT / 3) + 1);
		expect(await codeOf(() => readBody(post(body)))).toBe("payload_too_large");
	});

	test("refuses a declared Content-Length over the limit before reading", async () => {
		const request = post("{}", { "content-length": String(BODY_LIMIT + 1) });
		expect(await codeOf(() => readBody(request))).toBe("payload_too_large");
		expect(request.bodyUsed).toBe(false);
	});

	test("refuses a stream that passes the limit without a Content-Length", async () => {
		const chunk = new Uint8Array(16 * 1024).fill(97);
		let sent = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				sent += 1;
				controller.enqueue(chunk);
				if (sent > 100) controller.close();
			},
		});
		const request = new Request("http://localhost:3000/api/x", {
			method: "POST",
			body: stream,
			duplex: "half",
		} as RequestInit);
		expect(await codeOf(() => readBody(request))).toBe("payload_too_large");
		expect(sent).toBeLessThan(10);
	});

	test("refuses invalid UTF-8 with 400", async () => {
		expect(
			await codeOf(() => readBody(post(new Uint8Array([0xff, 0xfe])))),
		).toBe("bad_request");
	});

	test("takes a smaller limit", async () => {
		expect(await codeOf(() => readBody(post("abc"), 2))).toBe(
			"payload_too_large",
		);
	});
});

describe("checkOrigin", () => {
	const ORIGIN = "http://localhost:3000";
	const withOrigin = (origin?: string) =>
		new Request(`${ORIGIN}/api/x`, {
			method: "POST",
			headers: origin === undefined ? {} : { origin },
		});

	test("passes the app's own origin", () => {
		expect(() => checkOrigin(withOrigin(ORIGIN), ORIGIN)).not.toThrow();
	});

	test.each([
		["missing", undefined],
		["another site", "https://evil.example"],
		["another port", "http://localhost:4000"],
		["another scheme", "https://localhost:3000"],
		["a trailing slash", "http://localhost:3000/"],
		["null", "null"],
	])("refuses %s with 403 cross_origin", async (_name, origin) => {
		expect(await codeOf(() => checkOrigin(withOrigin(origin), ORIGIN))).toBe(
			"cross_origin",
		);
	});
});

describe("requestIdOf", () => {
	test("keeps the proxy's UUIDv7, lower-cased", () => {
		expect(requestIdOf(new Headers({ "x-request-id": V7.toUpperCase() }))).toBe(
			V7,
		);
	});

	test.each([
		["missing", {}],
		["not a UUIDv7", { "x-request-id": "hello" }],
	])("makes a new UUIDv7 when the header is %s", (_name, headers) => {
		const id = requestIdOf(new Headers(headers));
		expect(isUuidV7(id)).toBe(true);
		expect(id).not.toBe("hello");
	});

	test("makes a different id each time", () => {
		expect(requestIdOf(new Headers())).not.toBe(requestIdOf(new Headers()));
	});
});

describe("parseIfMatch", () => {
	test.each([
		['"1"', 1],
		['"42"', 42],
		['"2147483647"', 2_147_483_647],
	])("reads %s as %i", (header, version) => {
		expect(parseIfMatch(header)).toBe(version);
	});

	test.each([
		["missing", null],
		["unquoted", "3"],
		["weak", 'W/"3"'],
		["zero", '"0"'],
		["a leading zero", '"03"'],
		["negative", '"-1"'],
		["a decimal", '"1.5"'],
		["a list", '"1", "2"'],
		["a wildcard", "*"],
		["above the integer column", '"2147483648"'],
		["eleven digits", '"12345678901"'],
	])("refuses %s", (_name, header) => {
		expect(parseIfMatch(header)).toBeNull();
	});
});

describe("queuePending", () => {
	test("is true with Daybook-Queue: pending", () => {
		expect(queuePending(new Headers({ "daybook-queue": "pending" }))).toBe(true);
	});

	test("is true with the daybook_queue=pending cookie", () => {
		expect(
			queuePending(new Headers({ cookie: "a=1; daybook_queue=pending" })),
		).toBe(true);
	});

	test.each([
		["no marker", {}],
		["another header value", { "daybook-queue": "empty" }],
		["another cookie value", { cookie: "daybook_queue=done" }],
	])("is false with %s", (_name, headers) => {
		expect(queuePending(new Headers(headers))).toBe(false);
	});
});
