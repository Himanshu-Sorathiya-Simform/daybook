// @vitest-environment node
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { BREACH_TIMEOUT_MS, checkBreach, RANGE_URL } from "../breach";
import {
	breachedRange,
	cleanRange,
	failingRange,
	hangingRange,
	OTHERS,
	PADDING,
	rangeAnswer,
	rangeBody,
} from "./pwned";

const network = setupServer();

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.useRealTimers();
});
afterAll(() => network.close());

// SHA-1 test vectors computed outside this code, with Python's hashlib.
const PASSWORD = "password";
const PASSWORD_PREFIX = "5BAA6";
const PASSWORD_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";
const UNICODE = "pässwört-2026!";
const UNICODE_SHA1 = "D891580AC7AEBF77EF4D5998468D6C680F859778";

/** Records every request the fake range API receives, answering with `body`. */
function recordRequests(body = rangeBody([...OTHERS, ...PADDING])): Request[] {
	const requests: Request[] = [];
	network.use(
		http.get(`${RANGE_URL}:prefix`, ({ request }) => {
			requests.push(request);
			return new HttpResponse(body);
		}),
	);
	return requests;
}

describe("what is sent (BR-F01-03)", () => {
	test("asks for the first 5 hex characters of the SHA-1, uppercase, and nothing else", async () => {
		const requests = recordRequests();
		await checkBreach(PASSWORD);
		expect(requests).toHaveLength(1);
		expect(requests[0]!.method).toBe("GET");
		expect(requests[0]!.url).toBe(
			`https://api.pwnedpasswords.com/range/${PASSWORD_PREFIX}`,
		);
	});

	test("asks for padding and names itself", async () => {
		const requests = recordRequests();
		await checkBreach(PASSWORD);
		expect(requests[0]!.headers.get("add-padding")).toBe("true");
		expect(requests[0]!.headers.get("user-agent")).toBe("Daybook");
	});

	test("never sends the password or the rest of its hash", async () => {
		// Not "password", which the API's own host name contains.
		const secret = "correct horse battery";
		const suffix = "98DECC62ECE399A22ED30D490EF333BE7FDE7385".slice(5);
		const requests = recordRequests();
		await checkBreach(secret);
		const sent = `${requests[0]!.url} ${JSON.stringify([...requests[0]!.headers])}`;
		expect(sent.toLowerCase()).not.toContain(secret);
		expect(sent.toLowerCase()).not.toContain("correct");
		expect(sent.toUpperCase()).not.toContain(suffix);
	});

	test("hashes the password's UTF-8 bytes", async () => {
		const requests = recordRequests();
		await checkBreach(UNICODE);
		expect(requests[0]!.url).toBe(`${RANGE_URL}${UNICODE_SHA1.slice(0, 5)}`);
	});
});

describe("reading the answer", () => {
	test("a matching suffix with a count above 0 is a breach", async () => {
		network.use(breachedRange(PASSWORD));
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "breached" });
	});

	test.each([1, 3, 10_000_000])("a count of %i is a breach", async (count) => {
		network.use(breachedRange(PASSWORD, count));
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "breached" });
	});

	test("a matching suffix with the count 0 is padding, not a breach", async () => {
		network.use(
			rangeAnswer(rangeBody([...OTHERS, `${PASSWORD_SUFFIX}:0`, ...PADDING])),
		);
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "clean" });
	});

	test("no matching suffix is clean", async () => {
		network.use(cleanRange);
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "clean" });
	});

	test("a suffix that differs in its last character is not a match", async () => {
		const nearMiss = `${PASSWORD_SUFFIX.slice(0, -1)}9`;
		network.use(rangeAnswer(rangeBody([`${nearMiss}:7`, ...PADDING])));
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "clean" });
	});

	test("matches a suffix written in lowercase", async () => {
		network.use(rangeAnswer(rangeBody([`${PASSWORD_SUFFIX.toLowerCase()}:2`])));
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "breached" });
	});

	test("reads LF lines and a final line break as well as CRLF", async () => {
		network.use(rangeAnswer(`${OTHERS[0]}\n${PASSWORD_SUFFIX}:2\n`));
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "breached" });
	});

	test("a breach on the first or the last line is found", async () => {
		network.use(rangeAnswer(rangeBody([`${PASSWORD_SUFFIX}:2`, ...PADDING])));
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "breached" });
		network.use(rangeAnswer(rangeBody([...PADDING, `${PASSWORD_SUFFIX}:2`])));
		expect(await checkBreach(PASSWORD)).toEqual({ outcome: "breached" });
	});
});

describe("when the service cannot answer, the password is not refused (D-188)", () => {
	test.each([201, 204, 400, 403, 404, 429, 500, 502, 503])(
		"a %i answer is unavailable, with its status",
		async (status) => {
			network.use(
				rangeAnswer(status === 204 ? "" : `${PASSWORD_SUFFIX}:5`, status),
			);
			expect(await checkBreach(PASSWORD)).toEqual({
				outcome: "unavailable",
				reason: "status",
				status,
			});
		},
	);

	test("a network error is unavailable", async () => {
		network.use(failingRange);
		expect(await checkBreach(PASSWORD)).toEqual({
			outcome: "unavailable",
			reason: "network",
		});
	});

	test.each([
		["an HTML page", "<html><body>Sign in to the Wi-Fi</body></html>"],
		["an empty body", ""],
		["line breaks only", "\r\n\r\n"],
		["a space after the colon", `${PASSWORD_SUFFIX}: 3`],
		["a negative count", `${PASSWORD_SUFFIX}:-1`],
		["a decimal count", `${PASSWORD_SUFFIX}:1.5`],
		["no count", `${PASSWORD_SUFFIX}:`],
		["no colon", PASSWORD_SUFFIX],
		["a 34-character suffix", `${PASSWORD_SUFFIX.slice(1)}:3`],
		["a 36-character suffix", `0${PASSWORD_SUFFIX}:3`],
		["a character that is not hex", `G${PASSWORD_SUFFIX.slice(1)}:3`],
		["the full hash", `${PASSWORD_PREFIX}${PASSWORD_SUFFIX}:3`],
	])("%s is unavailable, as malformed", async (_, body) => {
		network.use(rangeAnswer(body));
		expect(await checkBreach(PASSWORD)).toEqual({
			outcome: "unavailable",
			reason: "malformed",
		});
	});

	test("one malformed line makes the whole answer untrusted, wherever it is", async () => {
		const match = `${PASSWORD_SUFFIX}:3`;
		network.use(rangeAnswer(rangeBody([match, ...PADDING, "garbage"])));
		expect(await checkBreach(PASSWORD)).toMatchObject({ reason: "malformed" });
		network.use(rangeAnswer(rangeBody(["garbage", ...PADDING, match])));
		expect(await checkBreach(PASSWORD)).toMatchObject({ reason: "malformed" });
	});
});

describe("the 3-second limit (BR-F01-03)", () => {
	test("the limit is 3 seconds", () => {
		expect(BREACH_TIMEOUT_MS).toBe(3000);
	});

	test("an answer that never comes is unavailable after 3 seconds, not before", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		network.use(hangingRange);
		let result: unknown;
		const check = checkBreach(PASSWORD).then((value) => {
			result = value;
		});
		await vi.advanceTimersByTimeAsync(BREACH_TIMEOUT_MS - 1);
		expect(result).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		await check;
		expect(result).toEqual({ outcome: "unavailable", reason: "timeout" });
	});

	// MSW's socket fake cannot stop a response midway: when the request is aborted it still
	// ends the response, and undici then fails its own internal check. So this one test fakes
	// `fetch` itself, the same edge, as undici behaves: the body errors when the request aborts.
	test("a body that stops arriving is unavailable after 3 seconds", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((_, init) => {
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(`${OTHERS[0]}\r\n`));
					init?.signal?.addEventListener("abort", () => {
						controller.error(new DOMException("aborted", "AbortError"));
					});
				},
			});
			return Promise.resolve(new Response(stream, { status: 200 }));
		});
		try {
			let result: unknown;
			const check = checkBreach(PASSWORD).then((value) => {
				result = value;
			});
			await vi.advanceTimersByTimeAsync(BREACH_TIMEOUT_MS - 1);
			expect(result).toBeUndefined();
			await vi.advanceTimersByTimeAsync(1);
			await check;
			expect(result).toEqual({ outcome: "unavailable", reason: "timeout" });
		} finally {
			fetch.mockRestore();
		}
	});

	test("an answer just inside the limit is used", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		network.use(
			http.get(`${RANGE_URL}:prefix`, async () => {
				await delay(BREACH_TIMEOUT_MS - 100);
				return new HttpResponse(`${PASSWORD_SUFFIX}:4`);
			}),
		);
		const check = checkBreach(PASSWORD);
		await vi.advanceTimersByTimeAsync(BREACH_TIMEOUT_MS - 100);
		expect(await check).toEqual({ outcome: "breached" });
	});

	test("leaves no timer behind after an answer", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		network.use(cleanRange);
		await checkBreach(PASSWORD);
		expect(vi.getTimerCount()).toBe(0);
	});

	test("leaves no timer behind after a network error", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		network.use(failingRange);
		await checkBreach(PASSWORD);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("the test network itself", () => {
	test("a request with no fake behind it fails instead of reaching the internet", async () => {
		await expect(fetch("https://example.com/")).rejects.toThrow();
	});
});
