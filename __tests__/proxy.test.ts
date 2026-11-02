// @vitest-environment node
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, test } from "vitest";
import { config } from "../proxy";

const matches = (url: string, headers: Record<string, string> = {}) =>
	unstable_doesMiddlewareMatch({ config, url, headers });

// BR-P2-28
describe("the proxy's matcher", () => {
	test.each([
		"/",
		"/dashboard",
		"/transactions?month=2026-11",
		"/login",
		"/settings/security",
		"/api/transactions",
		"/api/auth/sign-in/email",
		"/api/session/expired",
		"/print/reports/x",
		"/learn/icons-explained",
		"/iconic",
		"/monitoring-help",
	])("runs on %s", (url) => {
		expect(matches(url)).toBe(true);
	});

	test.each([
		"/_next/static/chunks/main.js",
		"/_next/image?url=%2Fa.png&w=64&q=75",
		"/favicon.ico",
		"/manifest.webmanifest",
		"/icon",
		"/icon.png",
		"/icon1.png",
		"/apple-icon.png",
		"/icons/192.png",
		"/serwist/sw.js",
		"/monitoring",
		"/monitoring?o=1",
	])("skips %s", (url) => {
		expect(matches(url)).toBe(false);
	});

	test.each([
		["next-router-prefetch", { "next-router-prefetch": "1" }],
		["purpose: prefetch", { purpose: "prefetch" }],
	])("skips a next/link prefetch (%s)", (_name, headers) => {
		expect(matches("/dashboard", headers)).toBe(false);
	});
});
