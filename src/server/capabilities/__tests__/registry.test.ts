// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
	CAPABILITY_CODES,
	type CapabilityCode,
	entryOf,
	REGISTRY,
} from "../registry";
import { switchName } from "../switches";

// P4 section 3, "The codes": every code M0 to M7 needs, and no M8 code (D-200).
const P4_CODES = {
	"goals.active.max": { kind: "limit", clientVisible: true, spec: "F06" },
	"analytics.heatmap.view": { kind: "premium", clientVisible: true, spec: "F09" },
	"analytics.comparative.view": {
		kind: "premium",
		clientVisible: true,
		spec: "F09",
	},
	"reports.quarterly.generate": {
		kind: "premium",
		clientVisible: true,
		spec: "F11",
	},
	"reports.annual.generate": { kind: "premium", clientVisible: true, spec: "F11" },
	"offline.writes": { kind: "flag", clientVisible: true, spec: "P1" },
	"sync.background": { kind: "flag", clientVisible: true, spec: "P1" },
	"insights.detector.categoryTrend": {
		kind: "flag",
		clientVisible: false,
		spec: "F10",
	},
	"insights.detector.budgetThreshold": {
		kind: "flag",
		clientVisible: false,
		spec: "F10",
	},
	"insights.detector.savingsRate": {
		kind: "flag",
		clientVisible: false,
		spec: "F10",
	},
	"insights.detector.outlier": { kind: "flag", clientVisible: false, spec: "F10" },
	"insights.detector.renewalsSoon": {
		kind: "flag",
		clientVisible: false,
		spec: "F10",
	},
	"insights.detector.savingsRecommendation": {
		kind: "flag",
		clientVisible: false,
		spec: "F10",
	},
} as const;

describe("REGISTRY", () => {
	test("holds exactly P4's codes, in P4's order", () => {
		expect(CAPABILITY_CODES).toEqual(Object.keys(P4_CODES));
	});

	test.each(Object.entries(P4_CODES))(
		"%s has P4's kind, visibility and spec",
		(code, expected) => {
			expect(entryOf(code as CapabilityCode)).toMatchObject(expected);
		},
	);

	test("goals.active.max is 3 on Free and unlimited on Premium", () => {
		expect(REGISTRY["goals.active.max"].default).toEqual({
			free: 3,
			premium: null,
		});
	});

	test("the two P1 flags are on by default and enforced only by the client (BR-P4-10)", () => {
		for (const code of ["offline.writes", "sync.background"] as const) {
			expect(REGISTRY[code]).toMatchObject({
				default: "on",
				enforcedBy: "client",
			});
		}
	});

	test("the six insight detectors are on by default and enforced by the server", () => {
		const detectors = CAPABILITY_CODES.filter((code) =>
			code.startsWith("insights.detector."),
		);
		expect(detectors).toHaveLength(6);
		for (const code of detectors) {
			expect(entryOf(code)).toMatchObject({
				default: "on",
				enforcedBy: "server",
			});
		}
	});

	test("no flag sets a rollout yet", () => {
		for (const code of CAPABILITY_CODES) {
			expect(entryOf(code)).not.toHaveProperty("rollout");
		}
	});

	test.each(CAPABILITY_CODES)(
		"%s is lowercase dotted segments, camelCase inside a segment",
		(code) => {
			expect(code).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);
		},
	);

	test.each(CAPABILITY_CODES)("%s has a one-line description", (code) => {
		const { description } = entryOf(code);
		expect(description.length).toBeGreaterThan(0);
		expect(description).not.toContain("\n");
	});

	test("no two codes share a kill-switch variable", () => {
		const names = CAPABILITY_CODES.map(switchName);
		expect(new Set(names).size).toBe(names.length);
	});
});
