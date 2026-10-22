// PostToolUse hook for Edit and Write. Runs Prettier on the file that was just
// written, using the Prettier installed in that file's own project. It stays
// silent unless Prettier cannot format the file.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const FORMATTABLE = /\.(?:[cm]?[jt]sx?|jsonc?|mdx?|s?css|ya?ml|html)$/i;
const SKIPPED_FOLDERS = /(?:^|\/)(?:node_modules|\.next|\.git)\//;

/** True when Prettier should run on this absolute path. */
export function shouldFormat(file) {
	const path = file.split("\\").join("/");

	return (
		path.startsWith("/") && FORMATTABLE.test(path) && !SKIPPED_FOLDERS.test(path)
	);
}

/** The nearest folder at or above `file` that holds a package.json, or null. */
export function findProjectRoot(file) {
	let directory = dirname(file);

	while (!existsSync(join(directory, "package.json"))) {
		const parent = dirname(directory);
		if (parent === directory) return null;
		directory = parent;
	}

	return directory;
}

/** Formats the file. Returns `{ status }` as "skipped", "formatted" or "failed". */
export function formatFile(file) {
	if (!shouldFormat(file) || !existsSync(file)) return { status: "skipped" };

	const root = findProjectRoot(file);
	const prettier = root && join(root, "node_modules/prettier/bin/prettier.cjs");

	if (!prettier || !existsSync(prettier)) return { status: "skipped" };

	try {
		execFileSync(
			process.execPath,
			[prettier, "--write", "--ignore-unknown", relative(root, file)],
			{
				cwd: root,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				timeout: 25000,
			},
		);
		return { status: "formatted" };
	} catch (error) {
		const detail = String(error.stderr || error.message).trim();
		return { status: "failed", message: detail };
	}
}

async function main() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;

	try {
		const { tool_input: toolInput } = JSON.parse(input);
		const result = formatFile(String(toolInput?.file_path ?? ""));

		if (result.status === "failed") {
			process.stderr.write(
				`Prettier could not format the file:\n${result.message}\n`,
			);
			process.exit(2);
		}
	} catch (error) {
		process.stderr.write(`The format hook failed: ${error.message}\n`);
		process.exit(1);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
