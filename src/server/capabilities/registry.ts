import "server-only";

/** What every registry entry holds (P4 section 3). */
type Entry = {
	/** One line for whoever reads the registry; never shown to users. */
	description: string;
	/** Whether `/api/me` returns it (BR-P4-11, CAP-5). */
	clientVisible: boolean;
	/** The spec that owns it. */
	spec: string;
};

/** Allowed only with the matching entitlement key (BR-P4-04). */
export type PremiumEntry = Entry & { kind: "premium" };

/** A number, the Premium value with the entitlement key and the Free value without; `null` is
 * unlimited (BR-P4-05). */
export type LimitEntry = Entry & {
	kind: "limit";
	default: { free: number; premium: number | null };
};

/** On or off, from the default, the rollout and the kill switch (BR-P4-06). */
export type FlagEntry = Entry & {
	kind: "flag";
	/** `client` flags are never checked by the server (BR-P4-10). */
	enforcedBy: "server" | "client";
	default: "on" | "off";
	/** 0 to 100: the flag is on for users whose bucket is below it (P4 section 5). */
	rollout?: number;
};

export type RegistryEntry = PremiumEntry | LimitEntry | FlagEntry;

/**
 * The capability registry (BR-P4-01): every code Daybook checks, and only those. Codes are
 * lowercase dotted segments, camelCase inside a segment, and never renamed once shipped.
 * Client code imports `CapabilityCode` with `import type` only, so none of this reaches the
 * browser. The M8 codes join when M8 starts (D-200).
 */
export const REGISTRY = {
	"goals.active.max": {
		kind: "limit",
		description: "How many Goals can be active at once",
		clientVisible: true,
		default: { free: 3, premium: null },
		spec: "F06",
	},
	"analytics.heatmap.view": {
		kind: "premium",
		description: "The spending heatmap in Analytics",
		clientVisible: true,
		spec: "F09",
	},
	"analytics.comparative.view": {
		kind: "premium",
		description: "The comparison views in Analytics",
		clientVisible: true,
		spec: "F09",
	},
	"reports.quarterly.generate": {
		kind: "premium",
		description: "Generating quarterly reports",
		clientVisible: true,
		spec: "F11",
	},
	"reports.annual.generate": {
		kind: "premium",
		description: "Generating annual reports",
		clientVisible: true,
		spec: "F11",
	},
	"offline.writes": {
		kind: "flag",
		description: "Saving changes offline through the write queue",
		clientVisible: true,
		enforcedBy: "client",
		default: "on",
		spec: "P1",
	},
	"sync.background": {
		kind: "flag",
		description: "Sending the write queue through Background Sync",
		clientVisible: true,
		enforcedBy: "client",
		default: "on",
		spec: "P1",
	},
	"insights.detector.categoryTrend": {
		kind: "flag",
		description: "The category trend insight",
		clientVisible: false,
		enforcedBy: "server",
		default: "on",
		spec: "F10",
	},
	"insights.detector.budgetThreshold": {
		kind: "flag",
		description: "The budget threshold insight",
		clientVisible: false,
		enforcedBy: "server",
		default: "on",
		spec: "F10",
	},
	"insights.detector.savingsRate": {
		kind: "flag",
		description: "The savings rate insight",
		clientVisible: false,
		enforcedBy: "server",
		default: "on",
		spec: "F10",
	},
	"insights.detector.outlier": {
		kind: "flag",
		description: "The unusual spending insight",
		clientVisible: false,
		enforcedBy: "server",
		default: "on",
		spec: "F10",
	},
	"insights.detector.renewalsSoon": {
		kind: "flag",
		description: "The renewals soon insight",
		clientVisible: false,
		enforcedBy: "server",
		default: "on",
		spec: "F10",
	},
	"insights.detector.savingsRecommendation": {
		kind: "flag",
		description: "The savings recommendation insight",
		clientVisible: false,
		enforcedBy: "server",
		default: "on",
		spec: "F10",
	},
} satisfies Record<string, RegistryEntry>;

/** Every registry code; a code outside it is a type error (BR-P4-02). */
export type CapabilityCode = keyof typeof REGISTRY;

/** The codes of one kind. */
export type CodeOfKind<K extends RegistryEntry["kind"]> = {
	[C in CapabilityCode]: (typeof REGISTRY)[C]["kind"] extends K ? C : never;
}[CapabilityCode];

export type FlagCode = CodeOfKind<"flag">;

export const CAPABILITY_CODES = Object.keys(REGISTRY) as CapabilityCode[];

/** A code's entry, widened to the union so callers can switch on `kind`. */
export function entryOf(code: CapabilityCode): RegistryEntry {
	return REGISTRY[code];
}
