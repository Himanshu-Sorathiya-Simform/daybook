import { profileCreateSchema } from "@/lib/profile";
import { ApiError } from "@/server/api/errors";
import { reply, route } from "@/server/api/route";
import { createProfile } from "@/server/dal/profile/create";
import { readProfileAnswer } from "@/server/dal/profile/read";

/** The profile with its version and whether the currency may change (BR-F02-26), or 404
 * before onboarding. It works without a profile (BR-P2-13). */
export const GET = route({ profile: false }, async (_ctx, tx) => {
	const answer = await readProfileAnswer(tx);
	if (!answer) throw new ApiError("not_found");
	return answer;
});

/** Onboarding's create (BR-F02-08, BR-F02-09): 201 with the new profile, or 200 with the
 * profile that already exists, unchanged. It needs no profile and runs no catch-up, so the
 * first request after it does (F02 section 11). */
export const POST = route(
	{ profile: false, body: profileCreateSchema },
	async (ctx, tx, { body }) => {
		const { answer, created } = await createProfile(tx, ctx, body);
		return reply(answer, { status: created ? 201 : 200 });
	},
);
