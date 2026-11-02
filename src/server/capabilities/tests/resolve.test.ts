// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
	CAPABILITY_CODES,
	type CapabilityCode,
	type FlagEntry,
	REGISTRY,
} from "../registry";
import {
	clientCapabilities,
	flagIsOn,
	resolveCapabilities,
	rolloutBucket,
} from "../resolve";

const USER = "0192f0c4-0000-7000-8000-000000000001";
const OTHER_USER = "0192f0c4-0000-7000-8000-000000000002";

const free = (switches = {}) =>
	resolveCapabilities({ userId: USER, entitlements: new Set(), switches });
const entitled = (...codes: CapabilityCode[]) =>
	resolveCapabilities({
		userId: USER,
		entitlements: new Set(codes),
		switches: {},
	});

describe("premium codes (BR-P4-04)", () => {
	const premium = CAPABILITY_CODES.filter(
		(code) => REGISTRY[code].kind === "premium",
	);

	// AC-P4-01
	test.each(premium)(
		"%s is premium_required without its entitlement key",
		(code) => {
			expect(free()[code]).toEqual({
				allowed: false,
				reason: "premium_required",
			});
		},
	);

	// AC-P4-01
	test.each(premium)("%s is ok with its entitlement key", (code) => {
		expect(entitled(code)[code]).toEqual({ allowed: true, reason: "ok" });
	});

	test("one code's key allows only that code", () => {
		const resolved = entitled("analytics.heatmap.view");
		expect(resolved["analytics.heatmap.view"].allowed).toBe(true);
		expect(resolved["analytics.comparative.view"].allowed).toBe(false);
		expect(resolved["goals.active.max"].limit).toBe(3);
	});

	test("a kill switch never touches a premium code", () => {
		// Startup refuses such a switch; the resolver ignores one all the same.
		const resolved = resolveCapabilities({
			userId: USER,
			entitlements: new Set(["analytics.heatmap.view"]),
			switches: { "analytics.heatmap.view": "off" } as never,
		});
		expect(resolved["analytics.heatmap.view"]).toEqual({
			allowed: true,
			reason: "ok",
		});
	});
});

describe("limits (BR-P4-05)", () => {
	// AC-P4-02
	test("goals.active.max is 3 without its entitlement key", () => {
		expect(free()["goals.active.max"]).toEqual({
			allowed: true,
			reason: "ok",
			limit: 3,
		});
	});

	// AC-P4-02
	test("goals.active.max is unlimited (null) with its entitlement key", () => {
		expect(entitled("goals.active.max")["goals.active.max"]).toEqual({
			allowed: true,
			reason: "ok",
			limit: null,
		});
	});

	test("another code's key leaves the limit at its Free value", () => {
		expect(entitled("analytics.heatmap.view")["goals.active.max"].limit).toBe(3);
	});
});

describe("flags (BR-P4-06)", () => {
	const flags = CAPABILITY_CODES.filter((code) => REGISTRY[code].kind === "flag");

	test.each(flags)("%s is on by default", (code) => {
		expect(free()[code]).toEqual({ allowed: true, reason: "ok" });
	});

	// AC-P4-03
	test.each(flags)("%s is feature_off when its kill switch is off", (code) => {
		expect(free({ [code]: "off" })[code]).toEqual({
			allowed: false,
			reason: "feature_off",
		});
	});

	test("a kill switch changes only its own flag", () => {
		const resolved = free({ "offline.writes": "off" });
		expect(resolved["offline.writes"].allowed).toBe(false);
		expect(resolved["sync.background"].allowed).toBe(true);
	});

	test("an entitlement key never turns a flag on", () => {
		const resolved = resolveCapabilities({
			userId: USER,
			entitlements: new Set(["offline.writes"]),
			switches: { "offline.writes": "off" },
		});
		expect(resolved["offline.writes"].reason).toBe("feature_off");
	});

	test("flags carry no limit", () => {
		expect(free()["offline.writes"]).not.toHaveProperty("limit");
	});
});

describe("flagIsOn, layer by layer (BR-P4-06)", () => {
	// USER's bucket for offline.writes is 12 (Python hashlib, see rolloutBucket below).
	const entry = (overrides: Partial<FlagEntry>): FlagEntry => ({
		kind: "flag",
		description: "A test flag",
		clientVisible: true,
		enforcedBy: "client",
		default: "off",
		spec: "P1",
		...overrides,
	});
	const on = (flag: FlagEntry, switches = {}) =>
		flagIsOn("offline.writes", flag, { userId: USER, switches });

	test.each([
		["on", true],
		["off", false],
	] as const)("the default %s decides alone", (value, expected) => {
		expect(on(entry({ default: value }))).toBe(expected);
	});

	// AC-P4-03
	test("a rollout replaces the default: on when the bucket is below it", () => {
		expect(on(entry({ default: "off", rollout: 13 }))).toBe(true);
		expect(on(entry({ default: "on", rollout: 12 }))).toBe(false);
	});

	test.each([
		[0, false],
		[100, true],
	])("a rollout of %i is %s for everyone", (rollout, expected) => {
		expect(on(entry({ rollout }))).toBe(expected);
		expect(
			flagIsOn("sync.background", entry({ rollout }), {
				userId: USER,
				switches: {},
			}),
		).toBe(expected);
	});

	// AC-P4-03
	test.each([
		["off", { default: "on" }, false],
		["off", { default: "off", rollout: 100 }, false],
		["on", { default: "off" }, true],
		["on", { default: "on", rollout: 0 }, true],
	] as const)("a kill switch %s beats %j", (kill, flag, expected) => {
		expect(on(entry(flag), { "offline.writes": kill })).toBe(expected);
	});

	test("another flag's kill switch is ignored", () => {
		expect(on(entry({ default: "on" }), { "sync.background": "off" })).toBe(
			true,
		);
	});
});

describe("rolloutBucket (P4 section 5)", () => {
	// AC-P4-04: expected values from Python's hashlib, independently:
	// int.from_bytes(sha256(f"{user}:{code}".encode()).digest()[:4], "big") % 100
	test.each([
		[USER, "offline.writes", 12],
		[USER, "sync.background", 87],
		[OTHER_USER, "offline.writes", 61],
		["a", "b", 22],
	])("%s with %s is %i", (userId, code, bucket) => {
		expect(rolloutBucket(userId, code)).toBe(bucket);
	});

	// AC-P4-04
	test("is the same on every call", () => {
		const buckets = Array.from({ length: 5 }, () =>
			rolloutBucket(USER, "offline.writes"),
		);
		expect(new Set(buckets)).toEqual(new Set([12]));
	});

	test("stays within 0 to 99", () => {
		for (let i = 0; i < 500; i += 1) {
			const bucket = rolloutBucket(`user-${i}`, "offline.writes");
			expect(bucket).toBeGreaterThanOrEqual(0);
			expect(bucket).toBeLessThan(100);
			expect(Number.isInteger(bucket)).toBe(true);
		}
	});
});

describe("resolveCapabilities", () => {
	test("resolves every registry code, and only those", () => {
		expect(Object.keys(free())).toEqual(CAPABILITY_CODES);
	});
});

describe("clientCapabilities (BR-P4-11)", () => {
	// AC-P4-07
	test("keeps exactly the client-visible codes", () => {
		const visible = CAPABILITY_CODES.filter(
			(code) => REGISTRY[code].clientVisible,
		);
		expect(Object.keys(clientCapabilities(free()))).toEqual(visible);
	});

	// AC-P4-07
	test("drops every insight detector", () => {
		const keys = Object.keys(clientCapabilities(free()));
		expect(keys.some((code) => code.startsWith("insights."))).toBe(false);
	});

	test("passes each visible code's resolution on unchanged", () => {
		const resolved = free({ "offline.writes": "off" });
		expect(clientCapabilities(resolved)).toEqual({
			"goals.active.max": { allowed: true, reason: "ok", limit: 3 },
			"analytics.heatmap.view": { allowed: false, reason: "premium_required" },
			"analytics.comparative.view": {
				allowed: false,
				reason: "premium_required",
			},
			"reports.quarterly.generate": {
				allowed: false,
				reason: "premium_required",
			},
			"reports.annual.generate": {
				allowed: false,
				reason: "premium_required",
			},
			"offline.writes": { allowed: false, reason: "feature_off" },
			"sync.background": { allowed: true, reason: "ok" },
		});
	});
});
