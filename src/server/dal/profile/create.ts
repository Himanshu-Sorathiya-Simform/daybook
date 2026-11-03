import "server-only";
import { randomUUIDv7 } from "node:crypto";
import type { ProfileAnswer, ProfileCreate } from "@/lib/profile";
import { shiftDays, todayIn } from "@/lib/time";
import { ApiError } from "../../api/errors";
import { profile } from "../../db/schema";
import type { RequestContext } from "../context";
import type { Tx } from "../with-user";
import { answerFor, PROFILE_COLUMNS, readProfileAnswer } from "./read";

/**
 * Creates the user's profile at onboarding (BR-F02-08, D-216), from a body the route has
 * checked. `lastCatchUpOn` starts at yesterday in the chosen zone, so the first request after
 * onboarding runs catch-up. The unique key on `user_id` decides between two creates: one
 * inserts, and the other, which waits for it to commit, inserts nothing and answers the
 * profile it finds, unchanged (BR-F02-09). From M3 the inserting transaction also seeds the
 * portfolio (F07).
 */
export async function createProfile(
	tx: Tx,
	ctx: RequestContext,
	body: ProfileCreate,
): Promise<{ answer: ProfileAnswer; created: boolean }> {
	const [inserted] = await tx
		.insert(profile)
		.values({
			id: randomUUIDv7(),
			userId: ctx.user.id,
			createdAt: ctx.now,
			updatedAt: ctx.now,
			country: body.country,
			currency: body.currency,
			timezone: body.timezone,
			weekStart: body.weekStart,
			lastCatchUpOn: shiftDays(todayIn(body.timezone, ctx.now), -1),
		})
		.onConflictDoNothing({ target: profile.userId })
		.returning(PROFILE_COLUMNS);
	if (inserted) return { answer: await answerFor(tx, inserted), created: true };

	// Read committed: this statement sees the profile the conflicting insert committed.
	const existing = await readProfileAnswer(tx);
	if (!existing) throw new ApiError("internal");
	return { answer: existing, created: false };
}
