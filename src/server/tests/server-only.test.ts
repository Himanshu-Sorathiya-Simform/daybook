// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// BR-P2-11: every server module starts with `import "server-only"`, so importing one from a
// client component fails the build instead of shipping server code to the browser.
function serverModules(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory())
			return entry.name === "tests" ? [] : serverModules(path);
		return /\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

const FIRST_LINE = 'import "server-only";';

test("finds the server modules to check", () => {
	expect(serverModules("src/server").length).toBeGreaterThan(5);
});

test.each(serverModules("src/server"))("%s starts with server-only", (path) => {
	const firstCode = readFileSync(path, "utf8")
		.split("\n")
		.find((line) => line.trim() !== "" && !line.trim().startsWith("//"));
	expect(firstCode).toBe(FIRST_LINE);
});
