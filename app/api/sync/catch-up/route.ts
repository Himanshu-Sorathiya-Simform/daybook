import { subscriptionCatchUpBodySchema } from "@/lib/subscriptions/schemas";
import type { CatchUpAnswer } from "@/lib/subscriptions/answers";
import { route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { bootCatchUp } from "@/server/dal/subscriptions/catch-up";

/** The boot catch-up (F05 section 11, BR-F05-06, D-256): every Subscription through today in one
 * write transaction, answering `{ skipped, chargesCreated, pricesUpdated }`. While the client
 * says Subscription changes wait in its queue, it does nothing and answers `skipped: true`.
 * `pricesUpdated` reports the daily pass the wrapper ran for this request. It needs a profile,
 * takes no `Idempotency-Key` (API-3) and does not run the lazy check itself (`catchUp: false`).
 * The body is `{}`. */
export const POST = route(
	{ body: subscriptionCatchUpBodySchema, idempotent: false, catchUp: false },
	async (ctx, tx, { queuePending }): Promise<CatchUpAnswer> => {
		const profiled = requireProfile(ctx);
		if (queuePending) {
			return {
				skipped: true,
				chargesCreated: 0,
				pricesUpdated: ctx.pricesUpdated,
			};
		}
		const { chargesCreated } = await bootCatchUp(tx, profiled);
		return { skipped: false, chargesCreated, pricesUpdated: ctx.pricesUpdated };
	},
);
