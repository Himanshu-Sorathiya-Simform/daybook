import "server-only";
import { createHash } from "node:crypto";
import {
	CAPABILITY_CODES,
	type CapabilityCode,
	entryOf,
	type FlagCode,
	type FlagEntry,
	REGISTRY,
} from "./registry";
import type { FlagSwitches } from "./switches";

export type Reason = "ok" | "premium_required" | "feature_off";

/** A resolved capability (P4 section 3). `allowed` is always true for a limit, whose `limit`
 * is the number, or `null` for unlimited. */
export type Resolved = {
	allowed: boolean;
	reason: Reason;
	limit?: number | null;
};

export type Capabilities = Record<CapabilityCode, Resolved>;

/** What the resolver reads besides the registry. Until F12 writes entitlements (M4), callers
 * pass none, and per-user overrides join with their table at M5 (D-505). */
export type ResolveInput = {
	userId: string;
	entitlements: ReadonlySet<CapabilityCode>;
	switches: FlagSwitches;
};

/** The user's rollout bucket for a flag (P4 section 5): the first 4 bytes of the SHA-256 of
 * `<userId>:<code>`, as an unsigned big-endian integer, modulo 100. */
export function rolloutBucket(userId: string, code: string): number {
	const digest = createHash("sha256").update(`${userId}:${code}`, "utf8").digest();
	return digest.readUInt32BE(0) % 100;
}

/** A flag, layer by layer, each later one overriding the earlier (BR-P4-06): the default, the
 * rollout when one is set, then the kill switch. The per-user override layer, between the
 * rollout and the kill switch, joins at M5 (D-505). */
export function flagIsOn(
	code: FlagCode,
	entry: FlagEntry,
	{ userId, switches }: Pick<ResolveInput, "userId" | "switches">,
): boolean {
	let on = entry.default === "on";
	if (entry.rollout !== undefined)
		on = rolloutBucket(userId, code) < entry.rollout;
	const kill = switches[code];
	if (kill !== undefined) on = kill === "on";
	return on;
}

function resolveOne(code: CapabilityCode, input: ResolveInput): Resolved {
	const entry = entryOf(code);
	const entitled = input.entitlements.has(code);
	switch (entry.kind) {
		case "premium":
			return entitled ?
					{ allowed: true, reason: "ok" }
				:	{ allowed: false, reason: "premium_required" };
		case "limit":
			return {
				allowed: true,
				reason: "ok",
				limit: entitled ? entry.default.premium : entry.default.free,
			};
		case "flag":
			return flagIsOn(code as FlagCode, entry, input) ?
					{ allowed: true, reason: "ok" }
				:	{ allowed: false, reason: "feature_off" };
	}
}

/** Every registry code, resolved for one user (BR-P4-03 to BR-P4-06). */
export function resolveCapabilities(input: ResolveInput): Capabilities {
	return Object.fromEntries(
		CAPABILITY_CODES.map((code) => [code, resolveOne(code, input)]),
	) as Capabilities;
}

export type ClientCapabilities = Partial<Capabilities>;

/** Only the codes the browser may see (BR-P4-11, AC-P4-07). */
export function clientCapabilities(capabilities: Capabilities): ClientCapabilities {
	return Object.fromEntries(
		CAPABILITY_CODES.filter((code) => REGISTRY[code].clientVisible).map(
			(code) => [code, capabilities[code]],
		),
	);
}
