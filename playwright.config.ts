import { defineConfig, devices } from "@playwright/test";

// The tests' own server, on its own port so a running `pnpm dev` on 3000 never clashes. Its
// `APP_ORIGIN` is set to match: Next.js never overrides a variable that is already set with
// `.env`'s value, and Better Auth's origin check needs the origin the browser uses.
const PORT = 3100;
const ORIGIN = `http://localhost:${PORT}`;

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
	// Deletes every account the tests signed up once the run ends (TST-6).
	globalTeardown: "./e2e/global-teardown.ts",
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "pnpm build && pnpm start",
		url: ORIGIN,
		env: { APP_ORIGIN: ORIGIN, PORT: String(PORT) },
		// Never a dev server: a production build is what these tests check.
		reuseExistingServer: false,
		timeout: 300_000,
	},
});
