import { expect, test } from "./fixtures";

/** The nonce in a response's CSP. */
function nonceOf(csp: string | undefined): string {
	const match = /'nonce-([^']+)'/.exec(csp ?? "");
	if (!match) throw new Error(`No nonce in the CSP: ${csp}`);
	return match[1]!;
}

// AC-P2-15
test("a page carries a CSP with a fresh nonce, and every Next.js script carries it", async ({
	request,
}) => {
	const first = await request.get("/");
	const second = await request.get("/");
	const nonce = nonceOf(first.headers()["content-security-policy"]);
	expect(nonceOf(second.headers()["content-security-policy"])).not.toBe(nonce);
	const html = await first.text();
	const scripts = html.match(/<script\b[^>]*>/g) ?? [];
	expect(scripts.length).toBeGreaterThan(0);
	for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
});

// AC-P2-15
test("a page loads in the browser with no CSP violation", async ({ page }) => {
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	await page.waitForLoadState("networkidle");
	// The fixture fails the test on any violation in the console.
});

// AC-P2-15
test("an API JSON response carries the other headers and no CSP", async ({
	request,
}) => {
	const response = await request.get("/api/auth/get-session");
	expect(response.status()).toBe(200);
	const headers = response.headers();
	expect(headers["content-type"]).toContain("application/json");
	expect(headers["content-security-policy"]).toBeUndefined();
	expect(headers["x-content-type-options"]).toBe("nosniff");
	expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
	expect(headers["permissions-policy"]).toContain("camera=()");
	expect(headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
});

// BR-P2-31
test("the proxy refuses a non-JSON API mutation with 415 and the envelope", async ({
	request,
}) => {
	const response = await request.post("/api/anything", {
		headers: { "content-type": "text/plain" },
		data: "hello",
	});
	expect(response.status()).toBe(415);
	const body = await response.json();
	expect(body.error.code).toBe("unsupported_media_type");
	expect(body.error.requestId).toBe(response.headers()["x-request-id"]);
});

// BR-P2-29
test("a logged-in page without a session cookie goes to login with next", async ({
	request,
	baseURL,
}) => {
	const response = await request.get("/dashboard", { maxRedirects: 0 });
	expect(response.status()).toBe(307);
	// Next.js sends a same-origin redirect as a relative location.
	const location = new URL(response.headers()["location"]!, baseURL);
	expect(location.origin).toBe(new URL(baseURL!).origin);
	expect(location.pathname).toBe("/login");
	expect(location.searchParams.get("next")).toBe("/dashboard");
});
