import "server-only";
import { sql } from "drizzle-orm";
import {
	firstDayOf,
	lastDayOf,
	type Month,
	monthsFrom,
	monthsStarting,
} from "@/lib/budgets/months";
import type { SubscriptionMonthsAnswer } from "@/lib/subscriptions/answers";
import { expectedMinor } from "@/lib/subscriptions/model";
import { safeInt } from "../../db/safe-int";
import type { ProfiledContext } from "../context";
import { SPENDING } from "../transactions/totals";
import type { Tx } from "../with-user";
import { ITEM_JOINS, ITEM_JSON, ITEM_ORDER, type ItemJson, readItem } from "./row";

/**
 * `GET /api/subscriptions/months` (BR-F05-36): each month from `from` to `to`, both validated
 * (`subscriptionMonthsQuerySchema`, `monthsWindowIssues`), as `{ month, chargedMinor,
 * expectedMinor }`, in one statement (D-293).
 *
 * - `chargedMinor` is Out for `source = subscription` in the month, charges of deleted
 *   Subscriptions included (BR-F05-18);
 * - `expectedMinor` is the month's chargeable dates on or after today with no charge and no
 *   tombstone, at current amounts: 0 for a past month.
 */
export async function subscriptionMonths(
	tx: Tx,
	ctx: ProfiledContext,
	{ from, to }: { from: Month; to: Month },
): Promise<SubscriptionMonthsAnswer> {
	const { rows } = await tx.execute<{
		items: ItemJson[];
		charged: { month: Month; chargedMinor: string }[];
	}>(
		sql`SELECT
			(SELECT coalesce(json_agg(${ITEM_JSON} ORDER BY ${ITEM_ORDER}), '[]'::json)
				FROM app.subscriptions s ${ITEM_JOINS}) AS items,
			(SELECT coalesce(json_agg(json_build_object(
					'month', month, 'chargedMinor', out::text)), '[]'::json)
				FROM (SELECT to_char(occurred_on, 'YYYY-MM') AS month, ${SPENDING} AS out
					FROM app.transactions
					WHERE source = 'subscription'
						AND occurred_on BETWEEN ${firstDayOf(from)}::date AND ${lastDayOf(to)}::date
					GROUP BY 1) AS m) AS charged`,
	);
	const [row] = rows as [
		{
			items: ItemJson[];
			charged: { month: Month; chargedMinor: string }[];
		},
	];
	const dated = row.items.map((json) => readItem(json, ctx.today).dated);
	const charged = new Map(
		row.charged.map(({ month, chargedMinor }) => [month, safeInt(chargedMinor)]),
	);
	return {
		months: monthsStarting(from, monthsFrom(from, to) + 1).map((month) => ({
			month,
			chargedMinor: charged.get(month) ?? 0,
			expectedMinor: expectedMinor(dated, month, ctx.today),
		})),
		currency: ctx.profile.currency,
	};
}
