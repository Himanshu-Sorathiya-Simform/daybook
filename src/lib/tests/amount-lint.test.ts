// @vitest-environment node
import { ESLint } from "eslint";
import { beforeAll, describe, expect, test } from "vitest";

// AC-F03-14: no float operation appears in the amount parser. The ban is an ESLint rule on
// `src/lib/amount.ts` (D-460), and on the histogram's edges (BR-F03-60, D-477); these tests
// prove the rule is on and covers each construct.

let eslint: ESLint;

beforeAll(() => {
	eslint = new ESLint({ cwd: process.cwd() });
});

async function bannedSyntax(code: string, filePath = "src/lib/amount.ts") {
	const [result] = await eslint.lintText(code, { filePath });
	return (result?.messages ?? []).filter(
		(message) => message.ruleId === "no-restricted-syntax",
	);
}

describe("the float ban on the amount module", () => {
	test.each([
		["parseFloat", "export const f = (s: string) => parseFloat(s);"],
		[
			"Number.parseFloat",
			"export const f = (s: string) => Number.parseFloat(s);",
		],
		["Number(...)", "export const f = (s: string) => Number(s);"],
		["unary plus", "export const f = (s: string) => +s;"],
		["division", "export const f = (a: number, b: number) => a / b;"],
		["multiplication", "export const f = (a: number, b: number) => a * b;"],
		["a power", "export const f = (a: number, b: number) => a ** b;"],
		[
			"division assignment",
			"export function f(a: number) { let b = a; b /= 2; return b; }",
		],
		[
			"multiplication assignment",
			"export function f(a: number) { let b = a; b *= 2; return b; }",
		],
		["toFixed", "export const f = (a: number) => a.toFixed(2);"],
		["Math", "export const f = (a: number) => Math.round(a);"],
	])(
		"refuses %s",
		async (_name, code) => {
			const messages = await bannedSyntax(code);

			expect(messages).toHaveLength(1);
			expect(messages[0]?.message).toMatch(/MON-1/);
		},
		30_000,
	);

	test("allows the string arithmetic the parser uses", async () => {
		const code = [
			'export const f = (s: string) => Number.parseInt(s.padEnd(4, "0"), 10);',
			"export const g = (a: number, b: number) => a + b - 1;",
		].join("\n");

		expect(await bannedSyntax(code)).toEqual([]);
	}, 30_000);

	test("applies only to the amount module", async () => {
		expect(
			await bannedSyntax(
				"export const f = (a: number) => a / 2;",
				"src/lib/money.ts",
			),
		).toEqual([]);
	}, 30_000);

	test("passes on the module as written", async () => {
		const [result] = await eslint.lintFiles(["src/lib/amount.ts"]);

		expect(result?.messages).toEqual([]);
	}, 30_000);
});

describe("the float ban on the histogram module (D-477)", () => {
	const HISTOGRAM = "src/server/dal/transactions/histogram.ts";

	test.each([
		["division", "export const f = (a: number, b: number) => a / b;"],
		["multiplication", "export const f = (a: number, b: number) => a * b;"],
		["a power", "export const f = (a: number) => 10 ** a;"],
		["Math", "export const f = (a: number) => Math.floor(a);"],
	])(
		"refuses %s",
		async (_name, code) => {
			expect(await bannedSyntax(code, HISTOGRAM)).toHaveLength(1);
		},
		30_000,
	);

	test("passes on the module as written", async () => {
		const [result] = await eslint.lintFiles([HISTOGRAM]);

		expect(result?.messages).toEqual([]);
	}, 30_000);
});
