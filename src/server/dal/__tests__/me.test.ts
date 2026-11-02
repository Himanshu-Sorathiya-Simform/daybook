// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { RequestContext } from "../context";
import { NO_GOALS_LOCK, NO_PLAN, readMe } from "../me";

const NOW = new Date("2026-11-02T06:30:00.000Z");

const base: RequestContext = {
	requestId: "0192f0c4-0000-7000-8000-00000000000a",
	user: {
		id: "0192f0c4-0000-7000-8000-000000000001",
		email: "golden@daybook.test",
		name: "Golden",
	},
	profile: null,
	now: NOW,
	today: null,
	pricesUpdated: false,
};

const golden: RequestContext = {
	...base,
	profile: {
		country: "IN",
		currency: "INR",
		timezone: "Asia/Kolkata",
		weekStart: "monday",
		lastCatchUpOn: "2026-11-02",
	},
	today: "2026-11-02",
};

const env = { BUILD_ID: "2026-11-01.3", flagSwitches: {} };

describe("readMe (BR-F02-25, BR-P4-11)", () => {
	test("before onboarding, profile and goals are null", () => {
		const me = readMe(base, env);
		expect(me.profile).toBeNull();
		expect(me.goals).toBeNull();
	});

	test("after onboarding, the profile block leaves out lastCatchUpOn", () => {
		expect(readMe(golden, env).profile).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "monday",
			numberLocale: "hi-IN-u-nu-latn",
			dateLocale: "en-IN",
		});
	});

	test("after onboarding, goals is F06's stand-in until F06 (D-505)", () => {
		expect(readMe(golden, env).goals).toEqual({
			lockedCount: 0,
			needsChoice: false,
		});
		expect(NO_GOALS_LOCK).toEqual({ lockedCount: 0, needsChoice: false });
	});

	test("the plan is F12's no-plan block, with or without a profile (D-505)", () => {
		expect(readMe(base, env).plan).toBe(NO_PLAN);
		expect(readMe(golden, env).plan).toBe(NO_PLAN);
	});

	test("copies only id, email and name from the user", () => {
		const extra = {
			...golden,
			user: { ...golden.user, password: "never" } as RequestContext["user"],
		};
		expect(readMe(extra, env).user).toEqual({
			id: golden.user.id,
			email: "golden@daybook.test",
			name: "Golden",
		});
	});

	test("resolvedAt is the request clock in ISO 8601 UTC, and buildId the server's", () => {
		const me = readMe(golden, env);
		expect(me.resolvedAt).toBe("2026-11-02T06:30:00.000Z");
		expect(me.buildId).toBe("2026-11-01.3");
	});

	test("a kill switch shows as feature_off", () => {
		const me = readMe(golden, {
			...env,
			flagSwitches: { "offline.writes": "off" },
		});
		expect(me.capabilities["offline.writes"]).toEqual({
			allowed: false,
			reason: "feature_off",
		});
		expect(me.capabilities["sync.background"]).toEqual({
			allowed: true,
			reason: "ok",
		});
	});

	// AC-P4-07
	test("a hidden flag's kill switch never reaches the answer", () => {
		const me = readMe(golden, {
			...env,
			flagSwitches: { "insights.detector.outlier": "off" },
		});
		expect(Object.keys(me.capabilities)).not.toContain(
			"insights.detector.outlier",
		);
	});

	test("no entitlements are read yet, so premium codes are refused and the limit is Free (D-505)", () => {
		const { capabilities } = readMe(golden, env);
		expect(capabilities["analytics.heatmap.view"]?.reason).toBe(
			"premium_required",
		);
		expect(capabilities["goals.active.max"]?.limit).toBe(3);
	});
});
