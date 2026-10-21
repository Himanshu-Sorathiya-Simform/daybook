// PreToolUse hook for Bash. Blocks commands that break the project's rules,
// including disguised forms that the permission rules in settings.json miss:
// `git -C . push`, `bash -c 'git commit'`, `/usr/bin/curl`, `env docker`.
// It stops mistakes. It is not a defense against someone trying to evade it.
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const BLOCKED_PROGRAMS = new Map([
	["docker", "Docker is not used in this project."],
	["docker-compose", "Docker is not used in this project."],
	["sudo", "sudo is blocked."],
	["curl", "curl is blocked. Use the web fetch tool for web pages."],
	["wget", "wget is blocked. Use the web fetch tool for web pages."],
]);

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const KEYWORDS = new Set([
	"if",
	"then",
	"else",
	"elif",
	"do",
	"while",
	"until",
	"!",
	"{",
	"time",
]);
const SIMPLE_WRAPPERS = new Set([
	"command",
	"builtin",
	"exec",
	"nohup",
	"setsid",
	"time",
]);
const XARGS_VALUE_FLAGS = new Set(["-I", "-n", "-P", "-d", "-L", "-s", "-E", "-a"]);

const READ_ONLY_GIT = new Set([
	"status",
	"log",
	"diff",
	"show",
	"blame",
	"shortlog",
	"describe",
	"rev-parse",
	"rev-list",
	"ls-files",
	"ls-tree",
	"ls-remote",
	"cat-file",
	"show-ref",
	"show-branch",
	"for-each-ref",
	"name-rev",
	"merge-base",
	"diff-tree",
	"diff-index",
	"diff-files",
	"range-diff",
	"grep",
	"check-ignore",
	"count-objects",
	"whatchanged",
	"version",
	"help",
	// Read-only only in some forms; see checkGitForms.
	"branch",
	"config",
	"remote",
	"tag",
	"stash",
	"reflog",
	"worktree",
	"submodule",
]);

const SAFE_GIT_CONFIG_KEYS = new Set(["core.quotepath", "color.ui"]);
const BRANCH_WRITE_FLAGS = new Set([
	"-d",
	"-D",
	"--delete",
	"-m",
	"-M",
	"--move",
	"-c",
	"-C",
	"--copy",
	"-u",
	"--set-upstream-to",
	"--unset-upstream",
	"-f",
	"--force",
	"--edit-description",
	"-t",
	"--track",
	"--no-track",
]);
const BRANCH_LIST_FLAGS = new Set([
	"-l",
	"--list",
	"--contains",
	"--no-contains",
	"--merged",
	"--no-merged",
	"--points-at",
]);
const CONFIG_WRITE_FLAGS = new Set([
	"--add",
	"--unset",
	"--unset-all",
	"--replace-all",
	"--rename-section",
	"--remove-section",
	"--edit",
	"-e",
	"--set",
]);
const PNPM_VALUE_FLAGS = new Set(["-C", "--dir", "--filter", "-F", "--filter-prod"]);

/** Reads text after an opening paren and returns the index of its closing paren. */
function readBalanced(text, start) {
	let depth = 1;
	let i = start;

	while (i < text.length) {
		const ch = text[i];

		if (ch === "\\") i += 2;
		else if (ch === "'") {
			const end = text.indexOf("'", i + 1);
			i = end === -1 ? text.length : end + 1;
		} else if (ch === '"') i = skipDoubleQuoted(text, i + 1);
		else {
			if (ch === "(") depth++;
			if (ch === ")" && --depth === 0) return i;
			i++;
		}
	}

	return text.length;
}

/** Returns the index just after the closing double quote that starts at `start`. */
function skipDoubleQuoted(text, start) {
	let i = start;

	while (i < text.length) {
		const ch = text[i];

		if (ch === '"') return i + 1;
		if (ch === "\\") i += 2;
		else if (ch === "$" && text[i + 1] === "(")
			i = readBalanced(text, i + 2) + 1;
		else i++;
	}

	return text.length;
}

/** Adds the script inside each `$(...)` and backtick pair in `text` to `nested`. */
function collectSubstitutions(text, nested) {
	let i = 0;

	while (i < text.length) {
		if (text[i] === "\\") i += 2;
		else if (text[i] === "$" && text[i + 1] === "(" && text[i + 2] !== "(") {
			const end = readBalanced(text, i + 2);
			nested.push(text.slice(i + 2, end));
			i = end + 1;
		} else if (text[i] === "`") {
			const end = text.indexOf("`", i + 1);
			const stop = end === -1 ? text.length : end;
			nested.push(text.slice(i + 1, stop));
			i = stop + 1;
		} else i++;
	}
}

/** Skips the bodies of pending here-documents; returns the index after them. */
function skipHeredocBodies(script, start, heredocs, nested) {
	let i = start;

	while (heredocs.length > 0) {
		const heredoc = heredocs.shift();
		let body = "";

		while (i < script.length) {
			const lineEnd = script.indexOf("\n", i);
			const stop = lineEnd === -1 ? script.length : lineEnd;
			const line = script.slice(i, stop);
			const compared = heredoc.stripTabs ? line.replace(/^\t+/, "") : line;

			i = stop + 1;
			if (compared === heredoc.delimiter) break;
			body += `${line}\n`;
		}

		if (!heredoc.quoted) collectSubstitutions(body, nested);
	}

	return i;
}

/**
 * Splits a shell script into simple commands (each an array of words).
 * Scripts found inside `$(...)`, backticks and process substitutions come back in
 * `nested`. Here-document bodies are skipped. Redirection targets are dropped.
 */
export function parseScript(script) {
	const commands = [];
	const nested = [];
	const heredocs = [];
	let words = [];
	let word = "";
	let inWord = false;
	let skipNext = false;

	const endWord = () => {
		if (inWord) {
			if (skipNext) skipNext = false;
			else words.push(word);
		}
		word = "";
		inWord = false;
	};
	const endCommand = () => {
		endWord();
		if (words.length > 0) commands.push(words);
		words = [];
		skipNext = false;
	};

	let i = 0;

	while (i < script.length) {
		const ch = script[i];
		const next = script[i + 1];

		if (ch === "\n") {
			endCommand();
			i = skipHeredocBodies(script, i + 1, heredocs, nested);
		} else if (ch === " " || ch === "\t") {
			endWord();
			i++;
		} else if (ch === "#" && !inWord) {
			const lineEnd = script.indexOf("\n", i);
			i = lineEnd === -1 ? script.length : lineEnd;
		} else if (ch === "\\") {
			if (next !== "\n") {
				word += next ?? "";
				inWord = true;
			}
			i += 2;
		} else if (ch === "'") {
			const end = script.indexOf("'", i + 1);
			const stop = end === -1 ? script.length : end;
			word += script.slice(i + 1, stop);
			inWord = true;
			i = stop + 1;
		} else if (ch === '"') {
			const end = skipDoubleQuoted(script, i + 1);
			const inner = script.slice(i + 1, Math.max(i + 1, end - 1));
			collectSubstitutions(inner, nested);
			word += inner.replace(/\\(["\\$`])/g, "$1");
			inWord = true;
			i = end;
		} else if (ch === "`") {
			const end = script.indexOf("`", i + 1);
			const stop = end === -1 ? script.length : end;
			nested.push(script.slice(i + 1, stop));
			word += "x";
			inWord = true;
			i = stop + 1;
		} else if (ch === "$" && next === "(") {
			if (script[i + 2] === "(") {
				const end = readBalanced(script, i + 2);
				word += "0";
				i = end + 1;
			} else {
				const end = readBalanced(script, i + 2);
				nested.push(script.slice(i + 2, end));
				word += "$x";
				i = end + 1;
			}
			inWord = true;
		} else if (ch === "$" && next === "{") {
			const end = script.indexOf("}", i + 2);
			const stop = end === -1 ? script.length : end;
			word += script.slice(i, stop + 1);
			inWord = true;
			i = stop + 1;
		} else if ((ch === "<" || ch === ">") && next === "(") {
			const end = readBalanced(script, i + 2);
			nested.push(script.slice(i + 2, end));
			word += "x";
			inWord = true;
			i = end + 1;
		} else if (ch === "<" && next === "<" && script[i + 2] === "<") {
			endWord();
			skipNext = true;
			i += 3;
		} else if (ch === "<" && next === "<") {
			let j = i + 2;
			const stripTabs = script[j] === "-";
			if (stripTabs) j++;
			while (script[j] === " " || script[j] === "\t") j++;
			const quoteChar =
				script[j] === "'" || script[j] === '"' ? script[j] : "";
			let delimiter = "";
			if (quoteChar) {
				const end = script.indexOf(quoteChar, j + 1);
				const stop = end === -1 ? script.length : end;
				delimiter = script.slice(j + 1, stop);
				j = stop + 1;
			} else {
				while (j < script.length && !/[\s;&|()<>]/.test(script[j])) {
					delimiter += script[j++];
				}
			}
			heredocs.push({ delimiter, quoted: quoteChar !== "", stripTabs });
			if (inWord && /^\d+$/.test(word)) {
				word = "";
				inWord = false;
			}
			endWord();
			i = j;
		} else if (ch === "<" || ch === ">") {
			if (inWord && /^\d+$/.test(word)) {
				word = "";
				inWord = false;
			}
			endWord();
			let j = i + 1;
			while (j < script.length && "<>&|".includes(script[j])) j++;
			skipNext = true;
			i = j;
		} else if (";&|()".includes(ch)) {
			endCommand();
			i++;
			while (i < script.length && ";&|".includes(script[i])) i++;
		} else {
			word += ch;
			inWord = true;
			i++;
		}
	}

	endCommand();
	return { commands, nested };
}

/** Returns a reason when the script must be blocked, otherwise null. */
function analyze(script, depth) {
	if (depth > 5)
		return "This command nests too deeply to check. Write it more plainly.";

	const { commands, nested } = parseScript(script);

	for (const inner of nested) {
		const reason = analyze(inner, depth + 1);
		if (reason) return reason;
	}

	for (const words of commands) {
		const reason = checkSimpleCommand(words, depth);
		if (reason) return reason;
	}

	return null;
}

/** Removes leading wrappers such as `env` and `nohup`; returns the real command. */
function unwrap(words) {
	let rest = [...words];
	const envNames = [];

	for (;;) {
		while (rest.length > 0 && KEYWORDS.has(rest[0])) rest = rest.slice(1);
		while (rest.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) {
			envNames.push(rest[0].split("=")[0]);
			rest = rest.slice(1);
		}
		if (rest.length === 0) return { words: rest, envNames, lookupOnly: false };

		const program = basename(rest[0]);
		const args = rest.slice(1);

		if (program === "env") {
			let i = 0;
			while (i < args.length) {
				const arg = args[i];
				if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) {
					envNames.push(arg.split("=")[0]);
					i++;
				} else if (["-u", "-C", "--chdir", "--unset"].includes(arg)) i += 2;
				else if (arg === "-S" || arg === "--split-string") {
					const split = parseScript(args[i + 1] ?? "").commands[0] ?? [];
					args.splice(i, 2, ...split);
				} else if (arg.startsWith("-")) i++;
				else break;
			}
			rest = args.slice(i);
		} else if (SIMPLE_WRAPPERS.has(program)) {
			if (program === "command" && (args[0] === "-v" || args[0] === "-V")) {
				return { words: [], envNames, lookupOnly: true };
			}
			let i = 0;
			while (args[i]?.startsWith("-")) i++;
			rest = args.slice(i);
		} else if (program === "nice") {
			let i = 0;
			while (args[i]?.startsWith("-")) i += args[i] === "-n" ? 2 : 1;
			rest = args.slice(i);
		} else if (program === "timeout") {
			let i = 0;
			while (args[i]?.startsWith("-"))
				i += ["-s", "-k"].includes(args[i]) ? 2 : 1;
			rest = args.slice(i + 1);
		} else if (program === "stdbuf") {
			let i = 0;
			while (args[i]?.startsWith("-")) i++;
			rest = args.slice(i);
		} else if (program === "xargs") {
			let i = 0;
			while (args[i]?.startsWith("-"))
				i += XARGS_VALUE_FLAGS.has(args[i]) ? 2 : 1;
			rest = args.slice(i);
		} else {
			return { words: rest, envNames, lookupOnly: false };
		}
	}
}

function checkSimpleCommand(rawWords, depth) {
	const { words, envNames, lookupOnly } = unwrap(rawWords);

	if (lookupOnly || words.length === 0) return null;

	const program = words[0];
	const name = basename(program);
	const args = words.slice(1);

	if (program.startsWith("$")) {
		return "The command name is computed at run time, so it cannot be checked. Write the command out.";
	}

	if (BLOCKED_PROGRAMS.has(name)) return BLOCKED_PROGRAMS.get(name);

	if (SHELLS.has(name)) {
		const flagIndex = args.findIndex((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a));
		if (flagIndex !== -1 && args[flagIndex + 1] !== undefined) {
			return analyze(args[flagIndex + 1], depth + 1);
		}
		return null;
	}

	if (name === "eval") return analyze(args.join(" "), depth + 1);

	if (name === "find") {
		for (let i = 0; i < args.length; i++) {
			if (!["-exec", "-execdir", "-ok", "-okdir"].includes(args[i])) continue;
			const end = args.findIndex((a, j) => j > i && (a === ";" || a === "+"));
			const reason = checkSimpleCommand(
				args.slice(i + 1, end === -1 ? args.length : end),
				depth + 1,
			);
			if (reason) return reason;
		}
		return null;
	}

	if (name === "git") return checkGit(args, envNames);

	return checkTestRunner(name, args);
}

/** Positional (non-flag) arguments, skipping the flags that take a value. */
function positionals(args, valueFlags = new Set()) {
	const result = [];

	for (let i = 0; i < args.length; i++) {
		if (valueFlags.has(args[i])) i++;
		else if (!args[i].startsWith("-")) result.push(args[i]);
	}

	return result;
}

function checkTestRunner(name, args) {
	const watchMessage =
		"Watch mode never exits. Run `pnpm test:run` instead, or add --run.";
	const hasRunFlag = args.includes("--run");
	const [first, second, third] = positionals(args, PNPM_VALUE_FLAGS);

	if (name === "vitest") {
		return hasRunFlag || first === "run" ? null : watchMessage;
	}

	if (["pnpm", "npm", "yarn", "bun"].includes(name)) {
		if (first === "test" || first === "t") {
			return hasRunFlag || second === "run" ? null : watchMessage;
		}
		if (first === "run" && second === "test") {
			return hasRunFlag || third === "run" ? null : watchMessage;
		}
		if (first === "vitest") {
			return hasRunFlag || second === "run" ? null : watchMessage;
		}
		if (["exec", "dlx", "x"].includes(first) && second === "vitest") {
			return hasRunFlag || third === "run" ? null : watchMessage;
		}
		return null;
	}

	if (["npx", "bunx", "pnpx"].includes(name) && first === "vitest") {
		return hasRunFlag || second === "run" ? null : watchMessage;
	}

	return null;
}

function blockedGit(subcommand) {
	return `\`git ${subcommand}\` is not on the read-only list. Only the user runs git commands that change the repo. If this one is read-only, ask the user to add it to .claude/hooks/guard-bash.mjs.`;
}

function checkGit(args, envNames) {
	if (envNames.some((n) => n.startsWith("GIT_"))) {
		return "Setting GIT_ environment variables for git is blocked; they can run other programs.";
	}

	let i = 0;

	while (i < args.length && args[i].startsWith("-")) {
		const arg = args[i];

		if (arg === "-C") i += 2;
		else if (arg === "-c") {
			const key = (args[i + 1] ?? "").split("=")[0].toLowerCase();
			if (!SAFE_GIT_CONFIG_KEYS.has(key)) {
				return `\`git -c ${key}\` is blocked; a config override can run other programs. Only core.quotepath and color.ui are allowed.`;
			}
			i += 2;
		} else if (/^--(git-dir|work-tree|namespace)(=|$)/.test(arg))
			i += arg.includes("=") ? 1 : 2;
		else if (
			[
				"--no-pager",
				"-p",
				"--paginate",
				"--no-replace-objects",
				"--bare",
				"--no-optional-locks",
				"--literal-pathspecs",
				"--glob-pathspecs",
				"--noglob-pathspecs",
				"--icase-pathspecs",
			].includes(arg)
		)
			i++;
		else if (
			[
				"--version",
				"--help",
				"-h",
				"--html-path",
				"--man-path",
				"--info-path",
				"--exec-path",
			].includes(arg)
		)
			return null;
		else
			return `Git option ${arg} before the subcommand is not on the allowed list.`;
	}

	const subcommand = args[i];

	if (subcommand === undefined) return null;
	if (!READ_ONLY_GIT.has(subcommand)) return blockedGit(subcommand);

	const rest = args.slice(i + 1);

	if (rest.some((a) => a === "--output" || a.startsWith("--output="))) {
		return `\`git ${subcommand} --output\` writes a file and is blocked.`;
	}
	if (
		subcommand === "grep"
		&& rest.some((a) => a === "-O" || a.startsWith("--open-files-in-pager"))
	) {
		return "`git grep --open-files-in-pager` runs another program and is blocked.";
	}

	return checkGitForms(subcommand, rest) ?
			blockedGit(`${subcommand} ${rest.join(" ")}`.trim())
		:	null;
}

/** For subcommands with both read and write forms: true when `rest` would write. */
function checkGitForms(subcommand, rest) {
	const flags = rest.filter((a) => a.startsWith("-"));
	const operands = positionals(rest, new Set(["-f", "--file", "--blob"]));

	switch (subcommand) {
		case "branch": {
			if (flags.some((f) => BRANCH_WRITE_FLAGS.has(f.split("=")[0])))
				return true;
			const listing = flags.some((f) =>
				BRANCH_LIST_FLAGS.has(f.split("=")[0]),
			);
			return !listing && operands.length > 0;
		}
		case "config":
			return (
				flags.some((f) => CONFIG_WRITE_FLAGS.has(f)) || operands.length > 1
			);
		case "remote":
			return operands.length > 0 && !["show", "get-url"].includes(operands[0]);
		case "tag":
			return (
				rest.length > 0 && !flags.some((f) => f === "-l" || f === "--list")
			);
		case "stash":
			return !["list", "show"].includes(operands[0] ?? "");
		case "reflog":
			return operands.length > 0 && !["show", "exists"].includes(operands[0]);
		case "worktree":
			return operands[0] !== "list";
		case "submodule":
			return operands[0] !== "status";
		default:
			return false;
	}
}

/** Returns `{ blocked: false }` or `{ blocked: true, reason }` for a Bash command. */
export function checkCommand(command) {
	const reason = analyze(command, 0);
	return reason ? { blocked: true, reason } : { blocked: false };
}

async function main() {
	let input = "";
	for await (const chunk of process.stdin) input += chunk;

	try {
		const { tool_input: toolInput } = JSON.parse(input);
		const result = checkCommand(String(toolInput?.command ?? ""));

		if (result.blocked) {
			process.stderr.write(`Blocked by the command guard: ${result.reason}\n`);
			process.exit(2);
		}
	} catch (error) {
		process.stderr.write(
			`The command guard failed, so it blocked the command to be safe: ${error.message}\n`,
		);
		process.exit(2);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
