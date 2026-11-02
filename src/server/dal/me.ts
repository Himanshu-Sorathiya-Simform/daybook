import "server-only";
import { type ProfileBlock, profileBlock } from "@/lib/profile";
import {
	type ClientCapabilities,
	clientCapabilities,
	resolveCapabilities,
} from "../capabilities/resolve";
import type { ServerEnv } from "../env";
import type { RequestContext } from "./context";

/** F12's plan block for a user with no plan record (F12 section 11), which every user has
 * until F12 writes plan records (M4, D-505). */
export const NO_PLAN = {
	premium: false,
	status: "none",
	source: null,
	hasBillingAccount: false,
	interval: null,
	price: null,
	currentPeriodEnd: null,
	endsAt: null,
	scheduledInterval: null,
	scheduledAt: null,
	endedAt: null,
	lapseSeenAt: null,
	duplicate: false,
} as const;

/** F06's Goals lock summary after onboarding, until F06 computes it (M6, D-505). */
export const NO_GOALS_LOCK = { lockedCount: 0, needsChoice: false } as const;

/** The `/api/me` answer (BR-F02-25, BR-P4-11, D-506). */
export type Me = {
	user: RequestContext["user"];
	/** `null` before onboarding. */
	profile: ProfileBlock | null;
	plan: typeof NO_PLAN;
	/** `null` before onboarding. */
	goals: typeof NO_GOALS_LOCK | null;
	/** The client-visible codes only (AC-P4-07). */
	capabilities: ClientCapabilities;
	/** The request clock, ISO 8601 UTC. */
	resolvedAt: string;
	buildId: string;
};

/** Builds `/api/me` for the request's user from its context, which already holds the
 * profile. Until F12 there are no entitlements to read, and until M5 no overrides (D-505). */
export function readMe(
	ctx: RequestContext,
	env: Pick<ServerEnv, "BUILD_ID" | "flagSwitches">,
): Me {
	const capabilities = resolveCapabilities({
		userId: ctx.user.id,
		entitlements: new Set(),
		switches: env.flagSwitches,
	});
	const { id, email, name } = ctx.user;
	return {
		user: { id, email, name },
		profile: ctx.profile ? profileBlock(ctx.profile) : null,
		plan: NO_PLAN,
		goals: ctx.profile ? NO_GOALS_LOCK : null,
		capabilities: clientCapabilities(capabilities),
		resolvedAt: ctx.now.toISOString(),
		buildId: env.BUILD_ID,
	};
}
