import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { checkDocs } from "../docs-check.mjs";

const byline = "16 Oct 2026 · @Himanshu";
const specPath = "docs/features/F01-demo.md";

const spec = (body = "") =>
	`# F01 Demo\n\n${byline}\n\n## 1. User stories\n\n- **BR-F01-01** A rule.\n\n## 2. Scope\n\n- **AC-F01-01** (unit) Given a, when b, then c.\n${body}`;

/** A small set of docs that passes every check. */
function goodDocs() {
	return new Map([
		[
			"docs/01-root-spec.md",
			`# Root\n\n${byline}\n\n## 1. First\n\n- **MON-1** Money is integers.\n\n## 2. Second\n`,
		],
		[
			"docs/02-decisions.md",
			`# Decisions\n\n${byline}\n\n| ID | Decision | Status | Why | Ref |\n| -- | -- | -- | -- | -- |\n| D-01 | A | Decided | y | z |\n| D-02 | B | Claude's call | y | z |\n`,
		],
		[
			"docs/features/_template.md",
			`# F00 Name\n\n${byline}\n\n## 1. User stories\n\n## 2. Scope\n`,
		],
		[specPath, spec()],
		["CLAUDE.md", "# Project\n\nA rule (MON-1, D-01).\n"],
	]);
}

const with_ = (path, text) => new Map([...goodDocs(), [path, text]]);
const checks = (docs) => checkDocs(docs).map(({ check }) => check);
const specWith = (body) => with_(specPath, spec(body));
const decisionsWith = (rows) =>
	with_("docs/02-decisions.md", `# D\n\n${byline}\n\n${rows}`);

const expectFlagged = (docs, check) => expect(checks(docs)).toContain(check);
const expectClean = (docs) => expect(checks(docs)).toEqual([]);

describe("a clean set of docs", () => {
	test("passes every check", () => {
		expect(checkDocs(goodDocs())).toEqual([]);
	});
});

describe("citations", () => {
	test.each([
		["a decision that is not in the log", "\nSee D-99.\n", "decision-id"],
		["a root rule that is not defined", "\nSee MON-9.\n", "rule-id"],
		[
			"a business rule that its spec does not define",
			"\nSee BR-F01-09.\n",
			"rule-id",
		],
		["a rule in a spec that does not exist", "\nSee BR-P2-01.\n", "rule-id"],
	])("flags %s", (_name, body, check) => {
		expectFlagged(specWith(body), check);
	});

	test("accepts a root rule that is defined", () => {
		expectClean(specWith("\nSee MON-1.\n"));
	});

	test("checks CLAUDE.md and rules files too", () => {
		const findings = checkDocs(with_("CLAUDE.md", "# Project\n\nSee D-99.\n"));

		expect(findings).toContainEqual(
			expect.objectContaining({ file: "CLAUDE.md", check: "decision-id" }),
		);
	});
});

describe("definitions", () => {
	test.each([
		[
			"a decision defined twice",
			decisionsWith(
				"| D-01 | A | Decided | y | z |\n| D-01 | B | Decided | y | z |\n",
			),
			"duplicate-id",
		],
		[
			"a decision with an unknown status",
			decisionsWith("| D-01 | A | Maybe | y | z |\n"),
			"decision-status",
		],
		[
			"a business rule defined twice in one spec",
			specWith("\n- **BR-F01-01** Again.\n"),
			"duplicate-id",
		],
		[
			"a root rule defined twice",
			with_(
				"docs/01-root-spec.md",
				`# Root\n\n${byline}\n\n## 1. First\n\n- **MON-1** One.\n- **MON-1** Two.\n`,
			),
			"duplicate-id",
		],
	])("flags %s", (_name, docs, check) => {
		expectFlagged(docs, check);
	});

	test("accepts a status with a note after it", () => {
		expectClean(
			decisionsWith(
				"| D-01 | A | Decided (headers Claude's call) | y | z |\n",
			),
		);
	});
});

describe("links", () => {
	test.each([
		["a link to a missing file", "\n[x](missing.md)\n"],
		[
			"a link to a heading that does not exist",
			"\n[x](../01-root-spec.md#nope)\n",
		],
	])("flags %s", (_name, body) => {
		expectFlagged(specWith(body), "link");
	});

	test.each([
		["a link to an existing heading", "\n[x](../01-root-spec.md#1-first)\n"],
		["a same-file anchor", "\n[x](#2-scope)\n"],
		["a heading with HTML tags", "\n## <b>Bold</b> text\n\n[x](#bold-text)\n"],
		["a heading with nested HTML tags", "\n## <scr<b>ipt>Hi\n\n[x](#hi)\n"],
		[
			"web links, code fences and inline code",
			"\n[a](https://example.com)\n```\n[b](missing.md)\n```\n`[c](missing.md)`\n",
		],
	])("accepts %s", (_name, body) => {
		expectClean(specWith(body));
	});
});

describe("structure", () => {
	test.each([
		[
			"a bad byline",
			with_(specPath, spec().replace(byline, "Oct 16, 2026 · @Himanshu")),
			"byline",
		],
		[
			"sections out of order",
			with_(specPath, spec().replace("## 2. Scope", "## 3. Scope")),
			"section-number",
		],
		[
			"a spec whose sections differ from the template",
			with_(specPath, spec().replace("## 2. Scope", "## 2. Something else")),
			"template-sections",
		],
		[
			"a leftover template comment",
			specWith("\n<!-- how to -->\n"),
			"template-comment",
		],
	])("flags %s", (_name, docs, check) => {
		expectFlagged(docs, check);
	});
});

describe("style", () => {
	test.each([
		["an em dash in prose", "\nA thing — and more.\n", "em-dash"],
		[
			"a marker for an open item in a spec",
			"\nTBD: pick one.\n",
			"open-question",
		],
		[
			"an open questions heading in a spec",
			"\n### Open questions\n",
			"open-question",
		],
	])("flags %s", (_name, body, check) => {
		expectFlagged(specWith(body), check);
	});

	test.each([
		[
			"the dash as a table value, alone or with a note",
			"\n| A | B |\n| -- | -- |\n| x | — |\n| y | — (no income) |\n",
		],
		["an em dash in code", "\nShows `a — b`.\n"],
		[
			"ordinary prose and the rule itself",
			"\nEach chart uses a predicate to decide whether it renders.\nNo open questions live in specs.\n",
		],
	])("allows %s", (_name, body) => {
		expectClean(specWith(body));
	});

	test("does not check the style of other files", () => {
		expectClean(with_("CLAUDE.md", "# P\n\nA — B and TBD.\n"));
	});
});

describe("frontmatter of skills, agents and rules", () => {
	const skill = ".claude/skills/demo/SKILL.md";
	const withSkill = (frontmatter) =>
		with_(skill, `---\n${frontmatter}\n---\n\n# Demo\n`);

	test.each([
		[
			"an unquoted value with a space and a hash",
			"name: demo\ndescription: Does a thing # well",
		],
		["a skill with no description", "name: demo"],
	])("flags %s", (_name, frontmatter) => {
		expectFlagged(withSkill(frontmatter), "frontmatter");
	});

	test.each([
		["a skill with no frontmatter", "# Demo\n"],
		["a block that is never closed", "---\nname: demo\n# Demo\n"],
	])("flags %s", (_name, text) => {
		expectFlagged(with_(skill, text), "frontmatter");
	});

	test("flags an unquoted value with a colon and a space", () => {
		const docs = withSkill("name: demo\ndescription: Does a thing: well");

		expect(checkDocs(docs)).toContainEqual(
			expect.objectContaining({ file: skill, check: "frontmatter", line: 3 }),
		);
	});

	test.each([
		[
			"quoted values and plain values without a colon",
			withSkill(
				'name: demo\ndescription: "Does a thing: well. Use it # always"\nargument-hint: "[x]"',
			),
		],
		[
			"a colon without a space after it",
			withSkill("name: demo\ndescription: See docs/a:b for it"),
		],
	])("accepts %s", (_name, docs) => {
		expectClean(docs);
	});

	test.each([
		[
			"does not require frontmatter in a supporting file of a skill",
			".claude/skills/demo/checklist.md",
			"# Checklist\n\n- A\n",
		],
		[
			"does not require name or description in a rule file",
			".claude/rules/demo.md",
			'---\npaths:\n    - "docs/**"\n---\n\n# Rule\n',
		],
	])("%s", (_name, path, text) => {
		expectClean(with_(path, text));
	});
});

describe("skills copied from another project", () => {
	const folder = ".claude/skills/copied";
	const broken =
		"---\nname: copied\ndescription: Not quoted: breaks\n---\n\n[x](nope.md) D-99\n";
	const copiedDocs = () => with_(`${folder}/SKILL.md`, broken);

	test("are checked when the folder has no SOURCE.md", () => {
		expect(checks(copiedDocs())).toEqual(
			expect.arrayContaining(["frontmatter", "link", "decision-id"]),
		);
	});

	test("are skipped when the folder has a SOURCE.md", () => {
		const docs = copiedDocs();
		docs.set(`${folder}/rules/a.md`, "[x](nope.md) D-99\n");
		docs.set(`${folder}/SOURCE.md`, "# Source: copied\n");

		expect(checkDocs(docs)).toEqual([]);
	});

	test("still check the SOURCE.md itself", () => {
		const docs = copiedDocs();
		docs.set(`${folder}/SOURCE.md`, "# Source: copied\n\nSee D-99.\n");

		expect(checkDocs(docs)).toContainEqual(
			expect.objectContaining({
				file: `${folder}/SOURCE.md`,
				check: "decision-id",
			}),
		);
	});

	test("do not exempt a skill folder that has no SOURCE.md", () => {
		const docs = copiedDocs();
		docs.set(".claude/skills/other/SOURCE.md", "# Source: other\n");

		expectFlagged(docs, "link");
	});
});

describe("history", () => {
	test("does not check review files", () => {
		const docs = with_(
			"docs/reviews/round-1.md",
			"# Old\n\nSee D-99 and [x](nope.md).\n",
		);

		expect(checkDocs(docs)).toEqual([]);
	});
});

describe("command line", () => {
	const run = (files, args = []) => {
		const folder = mkdtempSync(join(tmpdir(), "docs-check-"));

		try {
			for (const [path, text] of files) {
				mkdirSync(dirname(join(folder, path)), { recursive: true });
				writeFileSync(join(folder, path), text);
			}
			mkdirSync(join(folder, ".claude/rules"), { recursive: true });

			return spawnSync(
				process.execPath,
				[resolve(process.cwd(), "scripts/docs-check.mjs"), ...args],
				{ cwd: folder, encoding: "utf8" },
			);
		} finally {
			rmSync(folder, { recursive: true });
		}
	};

	test("exits 0 and says so for clean docs", () => {
		const result = run(goodDocs());

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("docs:check passed");
	});

	test("exits 1 and names the file, line and check for a problem", () => {
		const result = run(with_(specPath, spec("\nSee D-99.\n")));

		expect(result.status).toBe(1);
		expect(result.stdout).toMatch(
			/docs\/features\/F01-demo\.md:\d+ {2}\[decision-id\]/,
		);
	});

	test("shows only the files asked for", () => {
		const docs = with_(specPath, spec("\nSee D-99.\n"));

		expect(run(docs, ["docs/01-root-spec.md"]).status).toBe(0);
		expect(run(docs, [specPath]).status).toBe(1);
	});
});
