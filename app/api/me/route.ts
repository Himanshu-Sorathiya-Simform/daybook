import { route } from "@/server/api/route";
import { readMe } from "@/server/dal/me";
import { serverEnv } from "@/server/env";

/** Who the user is, their profile, plan, Goals lock and client-visible capabilities
 * (BR-F02-25, BR-P4-11). It works without a profile and runs no catch-up (BR-P2-13). */
export const GET = route({ profile: false }, async (ctx) =>
	readMe(ctx, serverEnv()),
);
