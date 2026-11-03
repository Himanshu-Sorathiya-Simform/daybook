import { defineConfig, devices } from "@playwright/test";

// The app's origin, as in `.env` (`APP_ORIGIN`). Next.js reads `.env` for the server; this
// process does not, so the default matches `.env.example`.
const ORIGIN = process.env["APP_ORIGIN"] ?? "http://localhost:3000";

/** End-to-end tests (`pnpm test:e2e`). They run locally, on a production build, against the
 * Neon development database (TST-6, BR-P3-18); CI does not run them. */
export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: true,
	reporter: "list",
	// A sign-up waits on the breached-password check (up to 3 s) and Neon round trips, with
	// every worker signing up at once; Playwright's 5 s default is too tight for that.
	expect: { timeout: 20_000 },
	// Some tests sign up and log in several times, each a few seconds against Neon.
	timeout: 90_000,
	use: { baseURL: ORIGIN },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "pnpm build && pnpm start",
		url: ORIGIN,
		// Never a dev server: a production build is what these tests check.
		reuseExistingServer: false,
		timeout: 300_000,
	},
});
