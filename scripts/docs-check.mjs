// Mechanical checks for the docs, written down in .claude/rules/docs.md.
// Usage: pnpm docs:check [file ...]
// With file arguments, only findings in those files are shown. Every file is
// still read, because a citation in one file is checked against the others.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { pathToFileURL } from "node:url";

const DECISION_STATUSES = ["Decided", "Claude's call", "Assumed", "Stretch", "Out"];
const BYLINE = /^\d{2} [A-Z][a-z]{2} \d{4} · @Himanshu$/;
const QUESTION_MARKERS =
	/\b(TBD|TODO|FIXME|to be decided|undecided|not yet decided)\b|to decide:|^#+\s*open questions?\b|\bopen questions?:/i;

const isSpecFile = (file) => /^docs\/(features\/F|platform\/P)\d+-/.test(file);
const isHistory = (file) => file.startsWith("docs/reviews/");
const isTemplate = (file) => file === "docs/features/_template.md";

/** Splits text into lines and marks the ones inside fenced code blocks. */
function readLines(text) {
	let inFence = false;

	return text.split("\n").map((content, index) => {
		const isFenceLine = /^\s*```/.test(content);
		if (isFenceLine) inFence = !inFence;
		return { content, number: index + 1, code: inFence || isFenceLine };
	});
}

/** Removes HTML tags, repeating until none is left (`<scr<b>ipt>` hides one). */
function stripTags(text) {
	let result = text;
	let previous;

	do {
		previous = result;
		result = result.replaceAll(/<[^<>]+>/g, "");
	} while (result !== previous);

	return result;
}

/** GitHub-style anchors for every heading in a file. */
function headingAnchors(lines) {
	const anchors = new Set();
	const seen = new Map();

	for (const { content, code } of lines) {
		const match = !code && content.match(/^#{1,6}\s(.+)$/);
		if (!match) continue;

		const base = stripTags(match[1].toLowerCase().replaceAll(/[`*~]/g, ""))
			.replaceAll(/[^\p{L}\p{N}\s_-]/gu, "")
			.trim()
			.replaceAll(/\s/g, "-");
		const count = seen.get(base) ?? 0;

		seen.set(base, count + 1);
		anchors.add(count === 0 ? base : `${base}-${count}`);
	}

	return anchors;
}

function definedRootIds(text) {
	const ids = new Set();

	for (const m of text.matchAll(/\*\*([A-Z]+-\d+)\*\*/g)) ids.add(m[1]);
	for (const m of text.matchAll(/\*\*[^*\n]*\(([A-Z]+-\d+)\)[^*\n]*\*\*/g))
		ids.add(m[1]);

	return new Set([...ids].filter((id) => !/^(?:D|BR|AC)-/.test(id)));
}

function duplicates(list) {
	return list.filter((item, index) => list.indexOf(item) !== index);
}

/** Collects every defined ID, and reports duplicates and bad decision statuses. */
function collectDefinitions(files, parsed, add) {
	const rootText = files.get("docs/01-root-spec.md") ?? "";
	const rootIds = definedRootIds(rootText);
	const prefixes = [...new Set([...rootIds].map((id) => id.split("-")[0]))];
	const decisionRows = new Map();
	const specIds = new Map();

	for (const id of duplicates(
		[...rootText.matchAll(/^- \*\*([A-Z]+-\d+)\*\*/gm)].map((m) => m[1]),
	)) {
		add("docs/01-root-spec.md", 0, "duplicate-id", `${id} is defined twice`);
	}

	for (const { content, number } of parsed.get("docs/02-decisions.md") ?? []) {
		const row = content.match(/^\| (D-\d+)\s*\|/);
		if (!row) continue;

		if (decisionRows.has(row[1]))
			add(
				"docs/02-decisions.md",
				number,
				"duplicate-id",
				`${row[1]} is defined twice`,
			);
		decisionRows.set(row[1], number);

		const status = content.split("|")[3]?.trim() ?? "";
		const plainStatus = status.replaceAll("\u2019", "'");
		if (!DECISION_STATUSES.some((s) => plainStatus.startsWith(s))) {
			add(
				"docs/02-decisions.md",
				number,
				"decision-status",
				`${row[1]} has status "${status}"`,
			);
		}
	}

	for (const file of files.keys()) {
		if (!isSpecFile(file)) continue;

		const ids = [
			...files.get(file).matchAll(/\*\*((?:BR|AC)-[FP]\d+-\d+)\*\*/g),
		].map((m) => m[1]);
		for (const id of duplicates(ids))
			add(file, 0, "duplicate-id", `${id} is defined twice`);
		specIds.set(posix.basename(file).split("-")[0], new Set(ids));
	}

	return {
		rootIds,
		rootCitation: new RegExp(String.raw`\b(?:${prefixes.join("|")})-\d+\b`, "g"),
		decisionRows,
		specIds,
	};
}

const DECISION_CITATION = /\bD-\d+\b/g;
const RULE_CITATION = /\b((?:BR|AC)-([FP]\d+)-\d+)\b/g;

/** What a line may cite, and how to tell whether each cited ID is defined. */
function citationRules(file, content, defs) {
	const isDecisionRow =
		file === "docs/02-decisions.md" && content.startsWith("| D-");

	return [
		{
			pattern: DECISION_CITATION,
			skip: isDecisionRow,
			check: "decision-id",
			isDefined: ([id]) => defs.decisionRows.has(id),
			problem: "is not in the decisions log",
		},
		{
			pattern: defs.rootCitation,
			check: "rule-id",
			isDefined: ([id]) => defs.rootIds.has(id),
			problem: "is not defined in the root spec",
		},
		{
			pattern: RULE_CITATION,
			check: "rule-id",
			isDefined: ([id, , specKey]) => defs.specIds.get(specKey)?.has(id),
			problem: "is not defined in its spec",
		},
	];
}

/** Every cited decision and rule must be defined. */
function checkCitations(file, lines, defs, add) {
	for (const { content, number } of lines) {
		for (const rule of citationRules(file, content, defs)) {
			if (rule.skip) continue;

			for (const match of content.matchAll(rule.pattern)) {
				if (!rule.isDefined(match))
					add(file, number, rule.check, `${match[0]} ${rule.problem}`);
			}
		}
	}
}

const LINK = /\[[^[\]]*\]\(([^)\s]+)\)/g;
const isExternalLink = (target) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);

/** Why a relative link is broken, or null when it reaches a file and heading. */
function linkProblem(file, target, parsed) {
	const [pathPart, anchor] = target.split("#");
	const resolved =
		pathPart ? posix.normalize(posix.join(dirname(file), pathPart)) : file;

	if (!parsed.has(resolved)) {
		return pathPart.endsWith(".md") ?
				`${target} does not resolve to a file`
			:	null;
	}
	if (anchor && !headingAnchors(parsed.get(resolved)).has(anchor))
		return `${target} has no such heading`;

	return null;
}

/** Every relative link must reach a file, and its heading must exist. */
function checkLinks(file, lines, parsed, add) {
	for (const { content, number, code } of lines) {
		if (code) continue;

		const prose = content.replaceAll(/`[^`]*`/g, "");
		for (const [, target] of prose.matchAll(LINK)) {
			if (isExternalLink(target)) continue;

			const problem = linkProblem(file, target, parsed);
			if (problem) add(file, number, "link", problem);
		}
	}
}

/** Em dashes in prose, and open questions inside specs. */
function checkStyle(file, lines, add) {
	const isRule = isSpecFile(file) || file === "docs/01-root-spec.md";

	for (const { content, number, code } of lines) {
		if (code) continue;

		const cells = content
			.split("|")
			.map((cell) => cell.trim().replaceAll(/`[^`]*`/g, ""));
		if (cells.some((cell) => / — /.test(cell))) {
			add(
				file,
				number,
				"em-dash",
				"an em dash in prose; use a comma, colon or new sentence",
			);
		}
		if (isRule && QUESTION_MARKERS.test(content)) {
			add(
				file,
				number,
				"open-question",
				"a question or open item inside a spec",
			);
		}
	}
}

/** The byline, the numbered sections, and a spec's match with the template. */
function checkStructure(file, lines, text, templateSections, add) {
	if (!BYLINE.test(lines[2]?.content ?? "")) {
		add(file, 3, "byline", 'line 3 must be "DD Mon YYYY · @Himanshu"');
	}

	const sections = lines
		.map(({ content, number, code }) => ({
			m: !code && content.match(/^## (\d+)\. (.+)$/),
			number,
		}))
		.filter(({ m }) => m);

	sections.forEach(({ m, number }, index) => {
		if (Number(m[1]) !== index + 1)
			add(
				file,
				number,
				"section-number",
				`section ${m[1]} should be ${index + 1}`,
			);
	});

	if (!isSpecFile(file)) return;

	const titles = sections.map(({ m }) => `${m[1]}. ${m[2].trim()}`);
	if (
		templateSections.length > 0
		&& titles.join("\n") !== templateSections.join("\n")
	) {
		add(
			file,
			0,
			"template-sections",
			"the sections do not match docs/features/_template.md",
		);
	}
	if (text.includes("<!--"))
		add(
			file,
			0,
			"template-comment",
			"the template's comment block is still in the file",
		);
}

// Only SKILL.md and agent files are loaded by Claude Code; other files in a
// skill folder are supporting material and carry no frontmatter.
const LOADED_FILE = /^\.claude\/(skills\/[^/]+\/SKILL\.md|agents\/[^/]+\.md)$/;
const FRONTMATTER_KEY = /^([A-Za-z][\w-]*):(.*)$/;

/** Checks each value for unquoted YAML traps and returns the keys it found. */
function checkFrontmatterValues(file, lines, add) {
	const keys = new Set();

	for (const { content, number } of lines) {
		const match = content.match(FRONTMATTER_KEY);
		if (!match) continue;

		const [, key, rest] = match;
		const value = rest.trimStart();
		keys.add(key);

		const quoted = /^["'[{|>&*!%@`]/.test(value);
		if (value && !quoted && /: | #/.test(value)) {
			add(
				file,
				number,
				"frontmatter",
				`quote the value of "${key}": an unquoted ": " or " #" breaks YAML`,
			);
		}
	}

	return keys;
}

/**
 * Frontmatter of skills, agents and rules. An unquoted value that holds a colon
 * and a space, or a space and a hash, breaks YAML parsers, so it must be quoted.
 */
function checkFrontmatter(file, lines, add) {
	const isLoaded = LOADED_FILE.test(file);

	if (lines[0]?.content !== "---") {
		if (isLoaded) {
			add(
				file,
				1,
				"frontmatter",
				"the file must start with a --- frontmatter block",
			);
		}
		return;
	}

	const end = lines.findIndex(
		({ content }, index) => index > 0 && content === "---",
	);
	if (end === -1) {
		add(
			file,
			1,
			"frontmatter",
			"the frontmatter block is never closed with ---",
		);
		return;
	}

	const keys = checkFrontmatterValues(file, lines.slice(1, end), add);
	if (!isLoaded) return;

	for (const key of ["name", "description"]) {
		if (!keys.has(key))
			add(file, 1, "frontmatter", `the frontmatter has no "${key}"`);
	}
}

/**
 * A skill folder that holds a SOURCE.md was copied from another project. Its
 * files stay as upstream, so they are not checked. The SOURCE.md itself is ours,
 * so it is checked.
 */
function copiedFileTest(files) {
	const folders = [...files.keys()]
		.filter((path) => /^\.claude\/skills\/[^/]+\/SOURCE\.md$/.test(path))
		.map((path) => path.slice(0, -"SOURCE.md".length));

	return (file) =>
		folders.some(
			(folder) => file.startsWith(folder) && file !== `${folder}SOURCE.md`,
		);
}

/**
 * Checks the docs. `files` maps a repo-relative path to its text.
 * Returns a list of `{ file, line, check, message }`.
 */
export function checkDocs(files) {
	const findings = [];
	const add = (file, line, check, message) =>
		findings.push({ file, line, check, message });
	const parsed = new Map(
		[...files].map(([file, text]) => [file, readLines(text)]),
	);
	const defs = collectDefinitions(files, parsed, add);
	const templateSections = (parsed.get("docs/features/_template.md") ?? [])
		.map(({ content, code }) =>
			code ? null : content.match(/^## (\d+)\. (.+)$/),
		)
		.filter(Boolean)
		.map((m) => `${m[1]}. ${m[2].trim()}`);

	const isCopied = copiedFileTest(files);

	for (const [file, lines] of parsed) {
		if (isHistory(file) || isTemplate(file) || isCopied(file)) continue;

		checkCitations(file, lines, defs, add);
		checkLinks(file, lines, parsed, add);

		if (file.startsWith(".claude/")) checkFrontmatter(file, lines, add);

		if (file.startsWith("docs/")) {
			checkStyle(file, lines, add);
			checkStructure(file, lines, files.get(file), templateSections, add);
		}
	}

	return findings;
}

function collectMarkdown(root, folder, found = []) {
	if (!existsSync(join(root, folder))) return found;

	for (const name of readdirSync(join(root, folder))) {
		const path = posix.join(folder, name);
		if (statSync(join(root, path)).isDirectory())
			collectMarkdown(root, path, found);
		else if (name.endsWith(".md")) found.push(path);
	}
	return found;
}

function main() {
	const root = process.cwd();
	const paths = [
		...collectMarkdown(root, "docs"),
		"CLAUDE.md",
		...collectMarkdown(root, ".claude/rules"),
		...collectMarkdown(root, ".claude/skills"),
		...collectMarkdown(root, ".claude/agents"),
	];
	const files = new Map(
		paths.map((path) => [path, readFileSync(join(root, path), "utf8")]),
	);
	const wanted = process.argv
		.slice(2)
		.map((arg) => relative(root, join(root, arg)).replaceAll("\\", "/"));
	const findings = checkDocs(files).filter(
		({ file }) => wanted.length === 0 || wanted.includes(file),
	);

	for (const { file, line, check, message } of findings) {
		const place = line ? `${file}:${line}` : file;
		console.log(`${place}  [${check}]  ${message}`);
	}

	if (findings.length === 0) {
		console.log(`docs:check passed (${files.size} files read)`);
		process.exit(0);
	}

	const noun = findings.length === 1 ? "problem" : "problems";
	console.log(`docs:check found ${findings.length} ${noun}`);
	process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	main();
