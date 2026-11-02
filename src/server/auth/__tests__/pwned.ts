import { createHash } from "node:crypto";
import { delay, http, HttpResponse } from "msw";
import { RANGE_URL } from "../breach";

/** Fakes of Have I Been Pwned's range API (BR-F01-03), for MSW. No test calls the real one. */

const ROUTE = `${RANGE_URL}:prefix`;

/** The SHA-1 of `password` in uppercase hex, split as the range API splits it. */
export function hashParts(password: string): { prefix: string; suffix: string } {
	const hash = createHash("sha1")
		.update(password, "utf8")
		.digest("hex")
		.toUpperCase();
	return { prefix: hash.slice(0, 5), suffix: hash.slice(5) };
}

/** Padding lines as `Add-Padding` adds them: made-up suffixes with the count 0. */
export const PADDING = [
	"0018A45C4D1DEF81644B54AB7F969B88D65:0",
	"00D4F6E8FA6EECAD2A3AA415EEC418D38EC:0",
	"011053FD0102E94D6AE2F8B83D76FAF94F6:0",
];

/** Real-looking lines for other passwords that share a prefix, with counts above 0. */
export const OTHERS = [
	"003D68EB55068C33ACE09247EE4C639306B:3",
	"012C192B2F16F82EA0EB9EF18D9D539B0DD:1",
];

/** A range answer of `lines`, CRLF-separated as the API sends it. */
export const rangeBody = (lines: readonly string[]) => lines.join("\r\n");

/** Answers every prefix with `body` and `status`. */
export function rangeAnswer(body: string, status = 200) {
	return http.get(ROUTE, () => new HttpResponse(body, { status }));
}

/** No password is breached: other suffixes and padding only. */
export const cleanRange = rangeAnswer(rangeBody([...OTHERS, ...PADDING]));

/** `password` is breached `count` times, among other suffixes and padding. */
export function breachedRange(password: string, count = 3) {
	const { suffix } = hashParts(password);
	return rangeAnswer(rangeBody([OTHERS[0]!, `${suffix}:${count}`, ...PADDING]));
}

/** Never answers, until the request is aborted. */
export const hangingRange = http.get(ROUTE, async () => {
	await delay("infinite");
	return new HttpResponse(null, { status: 200 });
});

/** Fails as a network error would (DNS, refused connection, reset). */
export const failingRange = http.get(ROUTE, () => HttpResponse.error());
