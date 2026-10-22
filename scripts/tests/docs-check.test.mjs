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

describe("a clean set of docs", () => {
	test("passes every check", () => {
		expect(checkDocs(goodDocs())).toEqual([]);
	});
});

describe("citations", () => {
	test("flags a decision that is not in the log", () => {
		expect(checks(with_(specPath, spec("\nSee D-99.\n")))).toContain(
			"decision-id",
		);
	});

	test("flags a root rule that is not defined", () => {
		expect(checks(with_(specPath, spec("\nSee MON-9.\n")))).toContain("rule-id");
	});

	test("accepts a root rule that is defined", () => {
		expect(checks(with_(specPath, spec("\nSee MON-1.\n")))).toEqual([]);
	});

	test("flags a business rule that its spec does not define", () => {
		expect(checks(with_(specPath, spec("\nSee BR-F01-09.\n")))).toContain(
			"rule-id",
		);
	});

	test("flags a rule in a spec that does not exist", () => {
		expect(checks(with_(specPath, spec("\nSee BR-P2-01.\n")))).toContain(
			"rule-id",
		);
	});

	test("checks CLAUDE.md and rules files too", () => {
		const findings = checkDocs(with_("CLAUDE.md", "# Project\n\nSee D-99.\n"));

		expect(findings).toContainEqual(
			expect.objectContaining({ file: "CLAUDE.md", check: "decision-id" }),
		);
	});
});

describe("definitions", () => {
	test("flags a decision defined twice", () => {
		const docs = with_(
			"docs/02-decisions.md",
			`# D\n\n${byline}\n\n| D-01 | A | Decided | y | z |\n| D-01 | B | Decided | y | z |\n`,
		);

		expect(checks(docs)).toContain("duplicate-id");
	});

	test("flags a decision with an unknown status", () => {
		const docs = with_(
			"docs/02-decisions.md",
			`# D\n\n${byline}\n\n| D-01 | A | Maybe | y | z |\n`,
		);

		expect(checks(docs)).toContain("decision-status");
	});

	test("accepts a status with a note after it", () => {
		const docs = with_(
			"docs/02-decisions.md",
			`# D\n\n${byline}\n\n| D-01 | A | Decided (headers Claude's call) | y | z |\n`,
		);

		expect(checks(docs)).toEqual([]);
	});

	test("flags a business rule defined twice in one spec", () => {
		expect(
			checks(with_(specPath, spec("\n- **BR-F01-01** Again.\n"))),
		).toContain("duplicate-id");
	});

	test("flags a root rule defined twice", () => {
		const docs = with_(
			"docs/01-root-spec.md",
			`# Root\n\n${byline}\n\n## 1. First\n\n- **MON-1** One.\n- **MON-1** Two.\n`,
		);

		expect(checks(docs)).toContain("duplicate-id");
	});
});

describe("links", () => {
	test("flags a link to a missing file", () => {
		expect(checks(with_(specPath, spec("\n[x](missing.md)\n")))).toContain(
			"link",
		);
	});

	test("flags a link to a heading that does not exist", () => {
		const docs = with_(specPath, spec("\n[x](../01-root-spec.md#nope)\n"));

		expect(checks(docs)).toContain("link");
	});

	test("accepts a link to an existing heading", () => {
		const docs = with_(specPath, spec("\n[x](../01-root-spec.md#1-first)\n"));

		expect(checks(docs)).toEqual([]);
	});

	test("accepts a same-file anchor", () => {
		expect(checks(with_(specPath, spec("\n[x](#2-scope)\n")))).toEqual([]);
	});

	test("ignores web links, code fences and inline code", () => {
		const body =
			"\n[a](https://example.com)\n```\n[b](missing.md)\n```\n`[c](missing.md)`\n";

		expect(checks(with_(specPath, spec(body)))).toEqual([]);
	});
});

describe("structure", () => {
	test("flags a bad byline", () => {
		const docs = with_(
			specPath,
			spec().replace(byline, "Oct 16, 2026 · @Himanshu"),
		);

		expect(checks(docs)).toContain("byline");
	});

	test("flags sections out of order", () => {
		const docs = with_(specPath, spec().replace("## 2. Scope", "## 3. Scope"));

		expect(checks(docs)).toContain("section-number");
	});

	test("flags a spec whose sections differ from the template", () => {
		const docs = with_(
			specPath,
			spec().replace("## 2. Scope", "## 2. Something else"),
		);

		expect(checks(docs)).toContain("template-sections");
	});

	test("flags a leftover template comment", () => {
		expect(checks(with_(specPath, spec("\n<!-- how to -->\n")))).toContain(
			"template-comment",
		);
	});
});

describe("style", () => {
	test("flags an em dash in prose", () => {
		expect(checks(with_(specPath, spec("\nA thing — and more.\n")))).toContain(
			"em-dash",
		);
	});

	test("allows the dash as a table value, alone or with a note", () => {
		const body = "\n| A | B |\n| -- | -- |\n| x | — |\n| y | — (no income) |\n";

		expect(checks(with_(specPath, spec(body)))).toEqual([]);
	});

	test("ignores an em dash in code", () => {
		expect(checks(with_(specPath, spec("\nShows `a — b`.\n")))).toEqual([]);
	});

	test("flags a marker for an open item in a spec", () => {
		expect(checks(with_(specPath, spec("\nTBD: pick one.\n")))).toContain(
			"open-question",
		);
	});

	test("flags an open questions heading in a spec", () => {
		expect(checks(with_(specPath, spec("\n### Open questions\n")))).toContain(
			"open-question",
		);
	});

	test("lets ordinary prose and the rule itself through", () => {
		const body =
			"\nEach chart uses a predicate to decide whether it renders.\nNo open questions live in specs.\n";

		expect(checks(with_(specPath, spec(body)))).toEqual([]);
	});

	test("does not check the style of other files", () => {
		expect(checks(with_("CLAUDE.md", "# P\n\nA — B and TBD.\n"))).toEqual([]);
	});
});

describe("frontmatter of skills, agents and rules", () => {
	const skill = ".claude/skills/demo/SKILL.md";
	const withSkill = (frontmatter) =>
		with_(skill, `---\n${frontmatter}\n---\n\n# Demo\n`);

	test("accepts quoted values and plain values without a colon", () => {
		const docs = withSkill(
			'name: demo\ndescription: "Does a thing: well. Use it # always"\nargument-hint: "[x]"',
		);

		expect(checks(docs)).toEqual([]);
	});

	test("flags an unquoted value with a colon and a space", () => {
		const docs = withSkill("name: demo\ndescription: Does a thing: well");

		expect(checkDocs(docs)).toContainEqual(
			expect.objectContaining({ file: skill, check: "frontmatter", line: 3 }),
		);
	});

	test("flags an unquoted value with a space and a hash", () => {
		const docs = withSkill("name: demo\ndescription: Does a thing # well");

		expect(checks(docs)).toContain("frontmatter");
	});

	test("accepts a colon without a space after it", () => {
		const docs = withSkill("name: demo\ndescription: See docs/a:b for it");

		expect(checks(docs)).toEqual([]);
	});

	test("flags a skill with no description", () => {
		expect(checks(withSkill("name: demo"))).toContain("frontmatter");
	});

	test("flags a skill with no frontmatter", () => {
		expect(checks(with_(skill, "# Demo\n"))).toContain("frontmatter");
	});

	test("flags a block that is never closed", () => {
		expect(checks(with_(skill, "---\nname: demo\n# Demo\n"))).toContain(
			"frontmatter",
		);
	});

	test("does not require frontmatter in a supporting file of a skill", () => {
		const docs = with_(
			".claude/skills/demo/checklist.md",
			"# Checklist\n\n- A\n",
		);

		expect(checks(docs)).toEqual([]);
	});

	test("does not require name or description in a rule file", () => {
		const docs = with_(
			".claude/rules/demo.md",
			'---\npaths:\n    - "docs/**"\n---\n\n# Rule\n',
		);

		expect(checks(docs)).toEqual([]);
	});
});

describe("skills copied from another project", () => {
	const folder = ".claude/skills/copied";
	const broken =
		"---\nname: copied\ndescription: Not quoted: breaks\n---\n\n[x](nope.md) D-99\n";

	test("are checked when the folder has no SOURCE.md", () => {
		const docs = with_(`${folder}/SKILL.md`, broken);

		expect(checks(docs)).toEqual(
			expect.arrayContaining(["frontmatter", "link", "decision-id"]),
		);
	});

	test("are skipped when the folder has a SOURCE.md", () => {
		const docs = with_(`${folder}/SKILL.md`, broken);
		docs.set(`${folder}/rules/a.md`, "[x](nope.md) D-99\n");
		docs.set(`${folder}/SOURCE.md`, "# Source: copied\n");

		expect(checkDocs(docs)).toEqual([]);
	});

	test("still check the SOURCE.md itself", () => {
		const docs = with_(`${folder}/SKILL.md`, broken);
		docs.set(`${folder}/SOURCE.md`, "# Source: copied\n\nSee D-99.\n");

		expect(checkDocs(docs)).toContainEqual(
			expect.objectContaining({
				file: `${folder}/SOURCE.md`,
				check: "decision-id",
			}),
		);
	});

	test("do not exempt a skill folder that has no SOURCE.md", () => {
		const docs = with_(`${folder}/SKILL.md`, broken);
		docs.set(".claude/skills/other/SOURCE.md", "# Source: other\n");

		expect(checks(docs)).toContain("link");
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
