// @vitest-environment node
import { describe, expect, test } from "vitest";
import { buildCsp, newNonce, securityHeaders } from "../csp";

const HTTP = { origin: "http://localhost:3000", development: false };
const HTTPS = { origin: "https://daybook.example", development: false };

/** The policy as directive name to value. */
const directives = (csp: string) =>
	Object.fromEntries(
		csp.split("; ").map((part) => {
			const [name, ...value] = part.split(" ");
			return [name, value.join(" ")];
		}),
	);

describe("buildCsp (BR-P2-33)", () => {
	test("has exactly P2's directives and values over http", () => {
		expect(directives(buildCsp("abc", HTTP))).toEqual({
			"default-src": "'self'",
			"script-src":
				"'self' 'nonce-abc' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com",
			"style-src": "'self' 'unsafe-inline'",
			"img-src":
				"'self' data: blob: https://cdn.sanity.io https://*.stripe.com https://*.link.com",
			"font-src": "'self'",
			"connect-src":
				"'self' https://api.stripe.com https://link.com https://*.link.com https://*.api.sanity.io https://*.apicdn.sanity.io",
			"frame-src":
				"https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://link.com https://*.link.com",
			"worker-src": "'self'",
			"manifest-src": "'self'",
			"form-action": "'self'",
			"base-uri": "'self'",
			"object-src": "'none'",
			"frame-ancestors": "'none'",
		});
	});

	test("adds upgrade-insecure-requests only over https", () => {
		expect(buildCsp("abc", HTTPS)).toMatch(/; upgrade-insecure-requests$/);
		expect(buildCsp("abc", HTTP)).not.toContain("upgrade-insecure-requests");
	});

	test("adds 'unsafe-eval' to scripts only in development", () => {
		const dev = directives(buildCsp("abc", { ...HTTP, development: true }));
		expect(dev["script-src"]).toMatch(/ 'unsafe-eval'$/);
		expect(buildCsp("abc", HTTP)).not.toContain("unsafe-eval");
	});

	test("carries the nonce it is given", () => {
		expect(buildCsp("n0nce+/=", HTTP)).toContain("'nonce-n0nce+/='");
	});

	test("never allows inline or eval scripts in production", () => {
		const script = directives(buildCsp("abc", HTTPS))["script-src"];
		expect(script).not.toContain("'unsafe-inline'");
		expect(script).not.toContain("'unsafe-eval'");
	});
});

describe("securityHeaders (BR-P2-34)", () => {
	test("over http: nosniff, referrer and permissions policies, and no HSTS", () => {
		expect(securityHeaders(HTTP.origin)).toEqual({
			"x-content-type-options": "nosniff",
			"referrer-policy": "strict-origin-when-cross-origin",
			"permissions-policy":
				'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
		});
	});

	test("over https adds Strict-Transport-Security for two years (D-442)", () => {
		expect(securityHeaders(HTTPS.origin)["strict-transport-security"]).toBe(
			"max-age=63072000; includeSubDomains",
		);
	});
});

describe("newNonce", () => {
	test("is 16 random bytes in base64", () => {
		const nonce = newNonce();
		expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
		expect(Buffer.from(nonce, "base64")).toHaveLength(16);
	});

	test("is fresh every time", () => {
		const nonces = new Set(Array.from({ length: 100 }, newNonce));
		expect(nonces.size).toBe(100);
	});
});
