import { transactionCreateSchema } from "@/lib/transactions/schemas";
import { reply, route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { listAnswer } from "@/server/dal/transactions/answers";
import { createTransaction } from "@/server/dal/transactions/create";
import { readListQuery } from "@/server/dal/transactions/query";

/** The Transactions list (F03 section 11): one page, its group totals and order fingerprint,
 * and the profile currency (API-6). */
export const GET = route({}, (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	return listAnswer(tx, profiled, readListQuery(query, profiled.profile.currency));
});

/** Creates a Transaction (F03 section 11, BR-F03-20): 201 with the row and the profile
 * currency, or 200 with the row an earlier create of the same id made (API-5). */
export const POST = route(
	{ body: transactionCreateSchema },
	async (ctx, tx, { body }) => {
		const { row, created } = await createTransaction(
			tx,
			requireProfile(ctx),
			body,
		);
		return reply(row, { status: created ? 201 : 200 });
	},
);
