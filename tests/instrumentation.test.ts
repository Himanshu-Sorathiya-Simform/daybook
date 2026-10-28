// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

// Placeholder values only; none of these is a real credential.
const roleUrl = (role: string) =>
	`postgresql://${role}:pw@db-pooler.example.com/neondb?sslmode=verify-full`;

const valid = {
	APP_ORIGIN: "http://localhost:3000",
	BETTER_AUTH_SECRET: "x".repeat(32),
	DATABASE_URL_AUTH: roleUrl("daybook_auth"),
	DATABASE_URL_RUNTIME: roleUrl("daybook_runtime"),
	DATABASE_URL_SYSTEM: roleUrl("daybook_system"),
};

function stub(values: Record<string, string>, runtime = "nodejs") {
	vi.stubEnv("NEXT_RUNTIME", runtime);
	for (const name of Object.keys(valid)) vi.stubEnv(name, "");
	for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

// BR-P2-38
describe("register", () => {
	test("starts with a valid environment", async () => {
		stub(valid);
		const { register } = await import("../instrumentation");
		await expect(register()).resolves.toBeUndefined();
	});

	// AC-P2-16
	test("stops the server with the list of what is missing or invalid", async () => {
		stub({ ...valid, BETTER_AUTH_SECRET: "short", DATABASE_URL_AUTH: "" });
		const { register } = await import("../instrumentation");
		await expect(register()).rejects.toMatchObject({
			name: "EnvError",
			problems: [
				"BETTER_AUTH_SECRET must be at least 32 characters",
				"DATABASE_URL_AUTH is required",
			],
		});
	});

	test("does nothing outside Node.js, where the server's variables do not exist", async () => {
		stub({}, "edge");
		const { register } = await import("../instrumentation");
		await expect(register()).resolves.toBeUndefined();
	});
});
