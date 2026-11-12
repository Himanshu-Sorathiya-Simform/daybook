import { monthOf } from "@/lib/budgets/months";
import { reply, route } from "@/server/api/route";
import { createBudget } from "@/server/dal/budgets/create";
import { readMonthQuery } from "@/server/dal/budgets/query";
import { budgetMonth } from "@/server/dal/budgets/read";
import { requireProfile } from "@/server/dal/context";

/** The month view for `month`, the current month by default, with the profile currency (F04
 * section 11, section 15). A month outside the range is 400 (D-566). */
export const GET = route({}, (ctx, tx, { query }) => {
	const profiled = requireProfile(ctx);
	return budgetMonth(tx, profiled, readMonthQuery(query, monthOf(profiled.today)));
});

/** Creates a Budget, from a month or restoring (F04 section 11, BR-F04-01, BR-F04-33): 201 with
 * the Budget and the profile currency, or 200 with the Budget an earlier create of the same id
 * made (API-5). The body is checked in `createBudget`. */
export const POST = route({}, async (ctx, tx, { body }) => {
	const { budget, created } = await createBudget(tx, requireProfile(ctx), body);
	return reply(budget, { status: created ? 201 : 200 });
});
