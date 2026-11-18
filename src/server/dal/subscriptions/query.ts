import "server-only";
import { isMonth, type Month } from "@/lib/budgets/months";
import {
	monthsWindowIssues,
	subscriptionMonthsQuerySchema,
} from "@/lib/subscriptions/schemas";
import { ApiError } from "../../api/errors";
import { badParams, single } from "../transactions/query";

/**
 * `GET /api/subscriptions/months`'s query (F05 section 11, BR-F05-36, D-596): `from` and `to`,
 * both required, each `YYYY-MM`, given once. `from` may not be after `to`, at most 24 months
 * may lie between them, and both lie within 120 months of the current month. Every refused
 * parameter is named in one 400 `bad_request`, `from` first (D-478), and a window miss also says
 * "Choose months from Nov 2016 to Nov 2036." as the message (BR-F05-36). Unknown names are
 * ignored (D-458).
 */
export function readMonthsQuery(
	query: URLSearchParams,
	current: Month,
): { from: Month; to: Month } {
	const from = single(query, "from");
	const to = single(query, "to");
	const refused = new Set<string>();
	let message: string | undefined;
	if (typeof from !== "string" || !isMonth(from)) refused.add("from");
	if (typeof to !== "string" || !isMonth(to)) refused.add("to");
	if (refused.size === 0) {
		const parsed = subscriptionMonthsQuerySchema.safeParse({ from, to });
		if (!parsed.success) {
			for (const issue of parsed.error.issues)
				refused.add(String(issue.path[0]));
		} else {
			for (const issue of monthsWindowIssues(parsed.data, current)) {
				refused.add(String(issue.path[0]));
				message = issue.message;
			}
		}
	}
	if (refused.size > 0) {
		const params = ["from", "to"].filter((name) => refused.has(name));
		if (message === undefined) throw badParams(params);
		throw new ApiError("bad_request", { details: { params }, message });
	}
	return { from: from as Month, to: to as Month };
}
