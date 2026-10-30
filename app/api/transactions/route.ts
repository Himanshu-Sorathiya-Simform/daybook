import { transactionCreateSchema } from "@/lib/transactions/schemas";
import { reply, route } from "@/server/api/route";
import { requireProfile } from "@/server/dal/context";
import { createTransaction } from "@/server/dal/transactions/create";
import { listTransactions } from "@/server/dal/transactions/list";
import { readListQuery } from "@/server/dal/transactions/query";

/** The Transactions list (F03 section 11): one page, its group totals and order fingerprint,
 * and the profile currency (API-6). */
export const GET = route({}, async (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	const { currency } = profiled.profile;
	const { filter, list, limit, cursor } = readListQuery(query, currency);
	const page = await listTransactions(tx, profiled, filter, {
		...list,
		limit,
		cursor,
	});
	return { ...page, currency };
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
