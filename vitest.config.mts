import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		tsconfigPaths: true,
		// `server-only` throws outside a React Server build. Tests import server modules
		// directly, so it resolves to the package's own empty module here (BR-P2-11).
		alias: {
			"server-only": fileURLToPath(
				new URL("./node_modules/server-only/empty.js", import.meta.url),
			),
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./vitest.setup.ts"],
		// Database tests run through vitest.integration.config.mts (`pnpm test:integration`).
		exclude: [
			...configDefaults.exclude,
			".next/**",
			"e2e/**",
			"**/*.integration.test.ts",
		],
		coverage: {
			provider: "v8",
			include: ["src/components/**", "src/lib/**", "src/server/**"],
			exclude: ["**/tests/**"],
			reporter: ["text"],
		},
	},
});
