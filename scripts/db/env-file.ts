import { existsSync } from "node:fs";

/** Which env file a database script reads, from `--env <file>` or `--env=<file>`.
 * `explicit` is true when the caller named one. */
export function envFileFromArgs(args: readonly string[]): {
	path: string;
	explicit: boolean;
} {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--env") {
			const next = args[i + 1];
			if (next === undefined || next.startsWith("--")) {
				throw new Error("--env needs a file, for example --env .env.test");
			}
			return { path: next, explicit: true };
		}
		if (arg?.startsWith("--env=")) {
			const path = arg.slice("--env=".length);
			if (path === "")
				throw new Error("--env needs a file, for example --env=.env.test");
			return { path, explicit: true };
		}
	}
	return { path: ".env", explicit: false };
}

/** Loads the env file the arguments name into `process.env`, and returns its path, or null
 * when nothing was loaded.
 *
 * - A file named with `--env` must exist. A typo in `--env .env.tset` must never fall
 *   back to `.env` and run against the main database.
 * - With no `--env`, `.env` is read when present. CI has no file; its variables already sit
 *   in the environment.
 * - Variables already set in the environment win over the file, as Node's loader does. */
export function loadEnvFile(args: readonly string[]): string | null {
	const { path, explicit } = envFileFromArgs(args);
	if (!existsSync(path)) {
		if (explicit) throw new Error(`The env file ${path} does not exist`);
		return null;
	}
	process.loadEnvFile(path);
	return path;
}
