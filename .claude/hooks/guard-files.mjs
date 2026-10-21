// PreToolUse hook for Edit and Write. Blocks two things:
// 1. Text shaped like a real secret. This repository is public.
// 2. Changes to a migration that git already tracks, since a committed migration
//    must not change.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const SECRET_PATTERNS = [
	{
		name: "a Stripe secret key",
		pattern: /\b[sr]k_(?:live|test)_[0-9A-Za-z]{10,}/g,
	},
	{ name: "a Stripe webhook secret", pattern: /\bwhsec_[0-9A-Za-z]{10,}/g },
	{
		name: "a GitHub token",
		pattern: /\b(?:gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{40,})/g,
	},
	{ name: "an AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
	{ name: "a Slack token", pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}/g },
	{ name: "a Sentry auth token", pattern: /\bsntry[su]_[0-9A-Za-z+/=_-]{30,}/g },
	{
		name: "a private key",
		pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/g,
	},
];

const DATABASE_URL = /\bpostgres(?:ql)?:\/\/[^\s:@/]+:([^\s@/]+)@[^\s/]+/g;
const PLACEHOLDER = /(.)\1{7,}|example|placeholder|redacted|changeme|your[-_]/i;
const MIGRATION = /(?:^|\/)drizzle\/.+\.sql$/;

function isPlaceholder(text) {
	return PLACEHOLDER.test(text) || /^<.*>$|^\$\{?\w+\}?$|^\[.*\]$/.test(text);
}

/** Returns the kind of secret found in `text`, or null. Placeholders pass. */
export function findSecret(text) {
	for (const { name, pattern } of SECRET_PATTERNS) {
		for (const match of text.matchAll(pattern)) {
			if (!isPlaceholder(match[0])) return name;
		}
	}

	for (const match of text.matchAll(DATABASE_URL)) {
		const password = match[1];
		if (password.length >= 12 && !isPlaceholder(password)) {
			return "a database URL with a password";
		}
	}

	return null;
}

function writtenText(toolName, toolInput) {
	if (toolName === "Write") return String(toolInput.content ?? "");
	if (toolName === "Edit") return String(toolInput.new_string ?? "");
	if (Array.isArray(toolInput.edits)) {
		return toolInput.edits
			.map((edit) => String(edit.new_string ?? ""))
			.join("\n");
	}
	return "";
}

/** Returns a reason when the write must be blocked, otherwise null. */
export function checkWrite({ toolName, toolInput, isTracked }) {
	const secret = findSecret(writtenText(toolName, toolInput));

	if (secret) {
		return `The text being written contains ${secret}. This repository is public, so never put a real secret in a file. Read it from an environment variable and list only the variable name in .env.example.`;
	}

	const file = String(toolInput.file_path ?? "")
		.split("\\")
		.join("/");

	if (MIGRATION.test(file) && isTracked(file)) {
		return `${file} is a committed migration, and a committed migration must not change. Add a new migration instead, or ask the user.`;
	}

	return null;
}

function isTrackedByGit(file) {
	let directory = dirname(file);

	while (!existsSync(directory) && directory !== dirname(directory)) {
		directory = dirname(directory);
	}

	try {
		execFileSync(
			"git",
			["-C", directory, "ls-files", "--error-unmatch", "--", file],
			{
				stdio: "ignore",
			},
		);
		return true;
	} catch {
		return false;
	}
}

async function main() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;

	try {
		const { tool_name: toolName, tool_input: toolInput } = JSON.parse(input);
		const reason = checkWrite({
			toolName,
			toolInput: toolInput ?? {},
			isTracked: isTrackedByGit,
		});

		if (reason) {
			process.stderr.write(`Blocked by the file guard: ${reason}\n`);
			process.exit(2);
		}
	} catch (error) {
		process.stderr.write(
			`The file guard failed, so it blocked the edit to be safe: ${error.message}\n`,
		);
		process.exit(2);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
