import "server-only";

const STRIPE_JS = "https://js.stripe.com https://*.js.stripe.com";
const LINK = "https://link.com https://*.link.com";

/** The Content Security Policy for one page response (BR-P2-33, D-165), with that response's
 * nonce. Scripts run only with the nonce, or when a nonced script loads them
 * (`'strict-dynamic'`), plus Stripe.js. Inline styles are allowed (D-195): React, React Aria
 * and toast libraries set `style` at runtime. Sentry goes through a same-origin tunnel, so it
 * needs no entry (D-196).
 *
 * - **https:** adds `upgrade-insecure-requests`.
 * - **Development:** adds `'unsafe-eval'`, which React needs there for its error overlays. */
export function buildCsp(
	nonce: string,
	{ origin, development }: { origin: string; development: boolean },
): string {
	const directives: [string, string][] = [
		["default-src", "'self'"],
		[
			"script-src",
			`'self' 'nonce-${nonce}' 'strict-dynamic' ${STRIPE_JS}${development ? " 'unsafe-eval'" : ""}`,
		],
		["style-src", "'self' 'unsafe-inline'"],
		[
			"img-src",
			"'self' data: blob: https://cdn.sanity.io https://*.stripe.com https://*.link.com",
		],
		["font-src", "'self'"],
		[
			"connect-src",
			`'self' https://api.stripe.com ${LINK} https://*.api.sanity.io https://*.apicdn.sanity.io`,
		],
		["frame-src", `${STRIPE_JS} https://hooks.stripe.com ${LINK}`],
		["worker-src", "'self'"],
		["manifest-src", "'self'"],
		["form-action", "'self'"],
		["base-uri", "'self'"],
		["object-src", "'none'"],
		["frame-ancestors", "'none'"],
	];
	const policy = directives.map(([name, value]) => `${name} ${value}`);
	if (isHttps(origin)) policy.push("upgrade-insecure-requests");
	return policy.join("; ");
}

/** The headers every response through the proxy carries besides the CSP (BR-P2-34). HSTS is
 * sent only over https, where a browser keeps it. */
export function securityHeaders(origin: string): Record<string, string> {
	return {
		"x-content-type-options": "nosniff",
		"referrer-policy": "strict-origin-when-cross-origin",
		"permissions-policy":
			'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
		...(isHttps(origin) ?
			{ "strict-transport-security": "max-age=63072000; includeSubDomains" }
		:	{}),
	};
}

/** A fresh nonce for one page response: 16 random bytes, base64 (BR-P2-32). */
export function newNonce(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
		"base64",
	);
}

function isHttps(origin: string): boolean {
	return origin.startsWith("https://");
}
