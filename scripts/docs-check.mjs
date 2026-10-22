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

/** GitHub-style anchors for every heading in a file. */
function headingAnchors(lines) {
	const anchors = new Set();
	const seen = new Map();

	for (const { content, code } of lines) {
		const match = !code && content.match(/^#{1,6}\s+(.+?)\s*#*$/);
		if (!match) continue;

		const base = match[1]
			.toLowerCase()
			.replace(/[`*~]/g, "")
			.replace(/<[^>]+>/g, "")
			.replace(/[^\p{L}\p{N}\s_-]/gu, "")
			.replace(/\s/g, "-");
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
		if (
			!DECISION_STATUSES.some((s) =>
				status.replace(/\u2019/g, "'").startsWith(s),
			)
		) {
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
		rootCitation: new RegExp(`\\b(?:${prefixes.join("|")})-\\d+\\b`, "g"),
		decisionRows,
		specIds,
	};
}

/** Every cited decision and rule must be defined. */
function checkCitations(file, lines, defs, add) {
	for (const { content, number } of lines) {
		const isDecisionRow =
			file === "docs/02-decisions.md" && content.startsWith("| D-");

		for (const m of content.matchAll(/\bD-\d+\b/g)) {
			if (!isDecisionRow && !defs.decisionRows.has(m[0])) {
				add(
					file,
					number,
					"decision-id",
					`${m[0]} is not in the decisions log`,
				);
			}
		}
		for (const m of content.matchAll(defs.rootCitation)) {
			if (!defs.rootIds.has(m[0]))
				add(
					file,
					number,
					"rule-id",
					`${m[0]} is not defined in the root spec`,
				);
		}
		for (const m of content.matchAll(/\b((?:BR|AC)-([FP]\d+)-\d+)\b/g)) {
			if (!defs.specIds.get(m[2])?.has(m[1]))
				add(file, number, "rule-id", `${m[1]} is not defined in its spec`);
		}
	}
}

/** Every relative link must reach a file, and its heading must exist. */
function checkLinks(file, lines, parsed, add) {
	for (const { content, number, code } of lines) {
		if (code) continue;

		for (const m of content
			.replace(/`[^`]*`/g, "")
			.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
			if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(m[1])) continue;

			const [pathPart, anchor] = m[1].split("#");
			const resolved =
				pathPart ?
					posix.normalize(posix.join(dirname(file), pathPart))
				:	file;

			if (!parsed.has(resolved)) {
				if (/\.md$/.test(pathPart))
					add(file, number, "link", `${m[1]} does not resolve to a file`);
			} else if (anchor && !headingAnchors(parsed.get(resolved)).has(anchor)) {
				add(file, number, "link", `${m[1]} has no such heading`);
			}
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
			.map((cell) => cell.trim().replace(/`[^`]*`/g, ""));
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

/**
 * Frontmatter of skills, agents and rules. An unquoted value that holds a colon
 * and a space, or a space and a hash, breaks YAML parsers, so it must be quoted.
 */
function checkFrontmatter(file, lines, add) {
	// Only SKILL.md and agent files are loaded by Claude Code; other files in a
	// skill folder are supporting material and carry no frontmatter.
	const isLoaded = /^\.claude\/(skills\/[^/]+\/SKILL\.md|agents\/[^/]+\.md)$/.test(
		file,
	);

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

	const keys = new Set();

	for (const { content, number } of lines.slice(1, end)) {
		const match = content.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
		if (!match) continue;

		const [, key, value] = match;
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

	if (isLoaded) {
		for (const key of ["name", "description"]) {
			if (!keys.has(key))
				add(file, 1, "frontmatter", `the frontmatter has no "${key}"`);
		}
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
		.map((arg) => relative(root, join(root, arg)).split("\\").join("/"));
	const findings = checkDocs(files).filter(
		({ file }) => wanted.length === 0 || wanted.includes(file),
	);

	for (const { file, line, check, message } of findings) {
		console.log(`${file}${line ? `:${line}` : ""}  [${check}]  ${message}`);
	}

	console.log(
		findings.length === 0 ?
			`docs:check passed (${files.size} files read)`
		:	`docs:check found ${findings.length} problem${findings.length === 1 ? "" : "s"}`,
	);
	process.exit(findings.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	main();
