import { randomBytes } from "node:crypto";

import { test as base, expect } from "@playwright/test";

/** A client address of its own for each test: Better Auth limits sign-up and sign-in to 3 per
 * 10 seconds per address (F01, D-153), and the tests run in parallel from one machine. It
 * counts IPv6 addresses per /64 network, so the random part sits inside the first 64 bits,
 * under the documentation prefix `2001:db8::/32`. */
export const clientAddress = () =>
	`2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}::1`;

/** Playwright's `test`, failing any test whose page logs a Content Security Policy violation
 * (BR-P3-18), with its own client address per test. */
export const test = base.extend<{ cspViolations: string[] }>({
	// Named `provide`, not `use`: the React hooks lint reads `use(...)` as React's hook.
	extraHTTPHeaders: async ({ extraHTTPHeaders }, provide) => {
		await provide({ ...extraHTTPHeaders, "x-forwarded-for": clientAddress() });
	},
	cspViolations: [
		async ({ page }, use) => {
			const violations: string[] = [];
			page.on("console", (message) => {
				if (/content security policy/i.test(message.text())) {
					violations.push(message.text());
				}
			});
			await use(violations);
			expect(violations, "CSP violations in the console").toEqual([]);
		},
		{ auto: true },
	],
});

export { expect };
