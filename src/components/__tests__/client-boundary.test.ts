// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// A shared component that runs in the browser (React Aria, Sonner, React state or effects, or
// another such component) starts with "use client", so a server page or layout can render it.
// Without it, `next build` fails on the first server component that imports it.
const BROWSER_ONLY =
	/react-aria-components|from "sonner"|from "next-themes"|\buse(State|Effect|Id|Ref|Context|SyncExternalStore|Memo|Callback)\b|from "@\/components\/(actions|forms|navigation|surfaces|feedback|data|app)\//;

function components(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory())
			return entry.name === "__tests__" ? [] : components(path);
		return entry.name.endsWith(".tsx") ? [path] : [];
	});
}

const browserOnly = components("src/components").filter((path) =>
	BROWSER_ONLY.test(readFileSync(path, "utf8")),
);

test("finds the browser-only components", () => {
	expect(browserOnly.length).toBeGreaterThan(20);
});

test.each(browserOnly)('%s starts with "use client"', (path) => {
	const [first] = readFileSync(path, "utf8").split("\n");
	expect(first).toBe('"use client";');
});
