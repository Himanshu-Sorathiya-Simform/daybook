import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Who may open which database door (BR-P2-11). Each entry is allowed only in its own home:
// `withUser` and the runtime pool in `server/dal` and the route wrapper, the system pool in
// `server/system`, the auth pool in `server/auth`. Tests and scripts are exempt: tests drive
// the pools directly, and scripts connect as the owner.
const DOORS = {
	withUser: {
		regex: "(^|/)dal/with-user$",
		message:
			"Only server/dal and the route wrapper open a user transaction (BR-P2-11).",
	},
	runtimePool: {
		regex: "(^|/)db/pools$",
		importNames: ["runtimePool"],
		message:
			"Only server/dal and the route wrapper use the runtime pool (BR-P2-11).",
	},
	systemPool: {
		regex: "(^|/)db/pools$",
		importNames: ["systemPool"],
		message: "Only server/system uses the system pool (BR-P2-11, SRV-5).",
	},
	authPool: {
		regex: "(^|/)db/pools$",
		importNames: ["authPool"],
		message: "Only server/auth uses the auth pool (BR-P2-40).",
	},
};

const restrict = (...doors) => ({
	"no-restricted-imports": [
		"error",
		{ patterns: doors.map((door) => DOORS[door]) },
	],
});

const EXEMPT = ["**/tests/**", "scripts/**", "vitest.*"];

// The amount parser turns text into minor units by joining digit strings, never through a float
// (MON-1, AC-F03-14, D-460). Each construct that could bring a float in is refused in that file.
const FLOAT_MESSAGE =
	"Amounts are integers built from digit strings; no float arithmetic here (MON-1, D-460).";
const FLOAT_BANS = [
	"CallExpression[callee.name='parseFloat']",
	"CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
	"CallExpression[callee.name='Number']",
	"UnaryExpression[operator='+']",
	"BinaryExpression[operator='/']",
	"BinaryExpression[operator='*']",
	"BinaryExpression[operator='**']",
	"AssignmentExpression[operator='/=']",
	"AssignmentExpression[operator='*=']",
	"AssignmentExpression[operator='**=']",
	"CallExpression[callee.property.name='toFixed']",
	"MemberExpression[object.name='Math']",
].map((selector) => ({ selector, message: FLOAT_MESSAGE }));

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts",
	]),
	{
		files: ["**/*.{ts,tsx,mts,js,mjs}"],
		ignores: [
			...EXEMPT,
			"src/server/dal/**",
			"src/server/api/route.ts",
			"src/server/system/**",
			"src/server/auth/**",
		],
		rules: restrict("withUser", "runtimePool", "systemPool", "authPool"),
	},
	{
		files: ["src/server/dal/**", "src/server/api/route.ts"],
		ignores: EXEMPT,
		rules: restrict("systemPool", "authPool"),
	},
	{
		files: ["src/server/system/**"],
		ignores: EXEMPT,
		rules: restrict("withUser", "runtimePool", "authPool"),
	},
	{
		files: ["src/server/auth/**"],
		ignores: EXEMPT,
		rules: restrict("withUser", "runtimePool", "systemPool"),
	},
	{
		files: ["src/lib/amount.ts"],
		rules: { "no-restricted-syntax": ["error", ...FLOAT_BANS] },
	},
]);

export default eslintConfig;
