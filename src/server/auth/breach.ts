import "server-only";
import { createHash } from "node:crypto";

/** Have I Been Pwned's range API (BR-F01-03). It needs no key. */
export const RANGE_URL = "https://api.pwnedpasswords.com/range/";
/** How long the check may take, the answer's body included, before the password is allowed
 * (BR-F01-03, D-188). */
export const BREACH_TIMEOUT_MS = 3000;

/** One line of a range answer: a 35-character hash suffix, a colon and a count. Padding lines
 * (`Add-Padding`) have the count 0. */
const LINE = /^([0-9A-F]{35}):(\d+)$/;

export type BreachCheck =
	| { outcome: "breached" }
	| { outcome: "clean" }
	| {
			outcome: "unavailable";
			/** What went wrong, for the warning: never the password or its hash. */
			reason: "timeout" | "network" | "status" | "malformed";
			status?: number;
	  };

/**
 * Checks `password` against Have I Been Pwned (BR-F01-03). Only the first 5 hex characters of
 * its SHA-1 hash leave the server, with `Add-Padding` so the answer's size reveals nothing;
 * the returned suffixes are compared here. A suffix counts only with a count above 0, since
 * padding lines carry 0.
 *
 * Every failure is `unavailable`, never an exception, so the caller can let the password
 * through (D-188): no answer within 3 seconds, a network error, a status other than 200, or a
 * body that is not the range format. A body with any line out of format is not trusted at
 * all, since a proxy or captive portal page could otherwise read as "no match".
 */
export async function checkBreach(password: string): Promise<BreachCheck> {
	const hash = createHash("sha1")
		.update(password, "utf8")
		.digest("hex")
		.toUpperCase();
	const prefix = hash.slice(0, 5);
	const suffix = hash.slice(5);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), BREACH_TIMEOUT_MS);
	try {
		const response = await fetch(`${RANGE_URL}${prefix}`, {
			headers: { "Add-Padding": "true", "User-Agent": "Daybook" },
			signal: controller.signal,
		});
		if (response.status !== 200) {
			return {
				outcome: "unavailable",
				reason: "status",
				status: response.status,
			};
		}
		return matchRange(await response.text(), suffix);
	} catch {
		return {
			outcome: "unavailable",
			reason: controller.signal.aborted ? "timeout" : "network",
		};
	} finally {
		clearTimeout(timer);
	}
}

/** Reads a range answer for `suffix`. Blank lines, such as a final newline, are skipped. */
function matchRange(body: string, suffix: string): BreachCheck {
	const lines = body.split(/\r?\n/).filter((line) => line !== "");
	if (lines.length === 0) return { outcome: "unavailable", reason: "malformed" };
	let breached = false;
	for (const line of lines) {
		const match = LINE.exec(line.toUpperCase());
		if (!match) return { outcome: "unavailable", reason: "malformed" };
		if (match[1] === suffix && Number(match[2]) > 0) breached = true;
	}
	return { outcome: breached ? "breached" : "clean" };
}
