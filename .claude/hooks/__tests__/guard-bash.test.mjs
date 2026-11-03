import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { checkCommand, parseScript } from "../guard-bash.mjs";

const hookPath = resolve(process.cwd(), ".claude/hooks/guard-bash.mjs");

const allowed = [
	"git status",
	"git status --short",
	"git diff --stat",
	"git diff --cached",
	"git log --oneline -5",
	'git log --grep="push" --oneline',
	"git show HEAD:CLAUDE.md",
	"git branch --show-current",
	"git branch -vv",
	"git branch -a",
	"git branch --list 'feat/*'",
	"git branch --contains abc123",
	"git config --get user.name",
	"git config --list",
	"git remote -v",
	"git remote show origin",
	"git tag",
	"git tag --list 'v*'",
	"git stash list",
	"git worktree list",
	"git ls-files --error-unmatch drizzle/0001.sql",
	"git -C . status",
	"git --no-pager log -3",
	"git -c core.quotepath=off diff",
	"git rev-parse --show-toplevel",
	"git blame -L 1,5 CLAUDE.md",
	"git reflog",
	"git submodule status",
	"git --version",
	"cd docs && git status",
	"git diff | head -20",
	"pnpm lint",
	"pnpm format:check",
	"pnpm typecheck",
	"pnpm test:run",
	"pnpm test:run src/a.test.ts",
	"pnpm test --run",
	"pnpm test -- --run",
	"pnpm test run",
	"pnpm run test --run",
	"pnpm vitest run",
	"pnpm exec vitest run",
	"npx vitest --run",
	"vitest run",
	"pnpm exec prettier --check .",
	'grep -rn "git push" docs/',
	'echo "git commit and curl and docker"',
	"rg curl docs",
	"node -e \"console.log('curl')\"",
	"command -v git",
	"ls -la",
	"cat <<'EOF'\ngit push\ncurl http://example.com\nEOF",
	"cat <<EOF > notes.txt\ngit commit -m x\nEOF",
	"git status 2>&1",
	"git diff > /dev/null",
];

const blocked = [
	["git add .", "git add"],
	["git commit -m x", "git commit"],
	["git push", "git push"],
	["git -C . push origin main", "git push"],
	["git --git-dir=.git push", "git push"],
	["/usr/bin/git commit -m x", "git commit"],
	["env git push", "git push"],
	["env -i FOO=1 git push", "git push"],
	["GIT_DIR=x git status", "GIT_"],
	["bash -c 'git commit -m x'", "git commit"],
	['sh -c "git push"', "git push"],
	["bash -lc 'git reset --hard'", "git reset"],
	["echo hi && git reset --hard", "git reset"],
	["git status; git checkout main", "git checkout"],
	['echo "$(git commit -m x)"', "git commit"],
	["echo `git push`", "git push"],
	["ls | xargs git rm", "git rm"],
	["find . -name x -exec git rm {} \\;", "git rm"],
	['eval "git push"', "git push"],
	["if true; then git push; fi", "git push"],
	["for f in a b; do git add $f; done", "git add"],
	["(git commit -m x)", "git commit"],
	["nohup git push &", "git push"],
	["timeout 5 git push", "git push"],
	["git branch newname", "git branch"],
	["git branch -D old", "git branch"],
	["git branch --delete old", "git branch"],
	["git branch -m a b", "git branch"],
	["git config user.name x", "git config"],
	["git config --global --add a b", "git config"],
	["git remote add origin url", "git remote"],
	["git tag v1", "git tag"],
	["git stash", "git stash"],
	["git stash pop", "git stash"],
	["git worktree add ../x", "git worktree"],
	["git worktree remove x", "git worktree"],
	["git submodule update", "git submodule"],
	["git reflog expire --all", "git reflog"],
	["git diff --output=out.txt", "--output"],
	["git cherry-pick abc", "git cherry-pick"],
	["git merge feature", "git merge"],
	["git rebase main", "git rebase"],
	["git fetch", "git fetch"],
	["git pull", "git pull"],
	["git clean -fd", "git clean"],
	["git restore .", "git restore"],
	["git switch main", "git switch"],
	["git checkout -b x", "git checkout"],
	["git -c alias.x='!rm -rf .' x", "alias.x"],
	["git -c core.pager=cat log", "core.pager"],
	["docker ps", "Docker"],
	["docker compose up", "Docker"],
	["docker-compose up", "Docker"],
	["sudo ls", "sudo"],
	["/usr/bin/curl http://example.com", "curl"],
	["bash -c 'wget http://example.com'", "wget"],
	["env curl http://example.com", "curl"],
	["echo hi | xargs curl", "curl"],
	["command curl http://example.com", "curl"],
	["nohup wget http://example.com &", "wget"],
	["pnpm test", "Watch mode"],
	["pnpm test src/a.test.ts", "Watch mode"],
	["pnpm -C . test", "Watch mode"],
	["pnpm run test", "Watch mode"],
	["pnpm vitest", "Watch mode"],
	["pnpm exec vitest", "Watch mode"],
	["npx vitest", "Watch mode"],
	["vitest", "Watch mode"],
	["$CMD push", "run time"],
];

describe("command guard", () => {
	test.each(allowed)("allows %j", (command) => {
		expect(checkCommand(command)).toEqual({ blocked: false });
	});

	test.each(blocked)("blocks %j", (command, mention) => {
		const result = checkCommand(command);

		expect(result.blocked).toBe(true);
		expect(result.reason).toContain(mention);
	});
});

describe("script parsing", () => {
	test("splits on separators and drops redirection targets", () => {
		const { commands } = parseScript("a b && c d > out.txt; e 2>&1 | f");

		expect(commands).toEqual([["a", "b"], ["c", "d"], ["e"], ["f"]]);
	});

	test("keeps quoted text as one word", () => {
		const { commands } = parseScript(`echo "a b" 'c d'`);

		expect(commands).toEqual([["echo", "a b", "c d"]]);
	});

	test("collects command substitutions", () => {
		const { nested } = parseScript("echo $(one) `two`");

		expect(nested).toEqual(["one", "two"]);
	});

	test("skips quoted here-document bodies", () => {
		const { commands } = parseScript("cat <<'EOF'\ngit push\nEOF\nls");

		expect(commands).toEqual([["cat"], ["ls"]]);
	});
});

describe("hook process", () => {
	const run = (command) =>
		spawnSync(process.execPath, [hookPath], {
			input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
			encoding: "utf8",
		});

	test("exits 0 for an allowed command", () => {
		expect(run("git status").status).toBe(0);
	});

	test("exits 2 and explains a blocked command", () => {
		const result = run("sh -c 'git push'");

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("git push");
	});

	test("exits 2 when the input cannot be read", () => {
		const result = spawnSync(process.execPath, [hookPath], {
			input: "not json",
			encoding: "utf8",
		});

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("blocked the command to be safe");
	});
});
