// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";

// BR-P2-11: the lint rule in eslint.config.mjs decides who may import each database door.
// Each case lints one import as if it lived at `path`; the file need not exist.
const eslint = new ESLint();

async function restricted(path: string, code: string): Promise<boolean> {
	const [result] = await eslint.lintText(`${code}\nexport {};\n`, {
		filePath: path,
	});
	return result!.messages.some((m) => m.ruleId === "no-restricted-imports");
}

const IMPORTS = {
	withUser: 'import { withUser } from "../dal/with-user";',
	runtimePool: 'import { runtimePool } from "../db/pools";',
	systemPool: 'import { systemPool } from "../db/pools";',
	authPool: 'import { authPool } from "../db/pools";',
	safeInt: 'import { safeInt } from "../db/pools";',
	aliased: 'import { runtimePool } from "@/server/db/pools";',
};

describe.each([
	["a feature", "src/features/transactions/queries.ts", []],
	["a server module outside the doors' homes", "src/server/reports/build.ts", []],
	[
		"the data access layer",
		"src/server/dal/transactions.ts",
		["withUser", "runtimePool"],
	],
	["the route wrapper", "src/server/api/route.ts", ["withUser", "runtimePool"]],
	["the system module", "src/server/system/stripe.ts", ["systemPool"]],
	["the auth module", "src/server/auth/index.ts", ["authPool"]],
	["a route handler", "app/api/transactions/route.ts", []],
] as const)("from %s (%s)", (_label, path, allowed) => {
	test.each(["withUser", "runtimePool", "systemPool", "authPool"] as const)(
		"%s is allowed only where it belongs",
		async (door) => {
			expect(await restricted(path, IMPORTS[door])).toBe(
				!(allowed as readonly string[]).includes(door),
			);
		},
	);

	test("safeInt, beside the pools, is allowed everywhere", async () => {
		expect(await restricted(path, IMPORTS.safeInt)).toBe(false);
	});
});

test("the rule also catches the @/ alias", async () => {
	expect(
		await restricted("src/features/transactions/queries.ts", IMPORTS.aliased),
	).toBe(true);
});

test.each([
	"src/server/dal/tests/with-user.integration.test.ts",
	"scripts/db/verify.ts",
	"vitest.integration.setup.ts",
])(
	"%s is exempt, since tests and scripts drive the pools directly",
	async (path) => {
		expect(await restricted(path, IMPORTS.runtimePool)).toBe(false);
	},
);
