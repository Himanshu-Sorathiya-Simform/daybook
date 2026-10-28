import { test as base, expect } from "@playwright/test";

/** Playwright's `test`, failing any test whose page logs a Content Security Policy violation
 * (BR-P3-18). */
export const test = base.extend<{ cspViolations: string[] }>({
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
