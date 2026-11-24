import "server-only";
import type { Month } from "@/lib/budgets/months";
import { parseDashboardMonth } from "@/lib/dashboard/schemas";
import { badParams, single } from "../transactions/query";

/** `GET /api/dashboard`'s query (F08 section 11): `month`, the current month by default. A
 * month that is not `YYYY-MM`, is repeated, is after the current month or is before 2000-01 is
 * 400 `bad_request` naming it (D-478). Unknown names are ignored (D-458). A month before the
 * first Transaction is fine: it answers zero figures. */
export function readDashboardQuery(query: URLSearchParams, today: string): Month {
	const raw = single(query, "month");
	// `null` is a repeated parameter, which `single` reports apart from an absent one.
	if (raw === null) throw badParams(["month"]);
	const parsed = parseDashboardMonth(raw, today);
	if (!parsed.ok) throw badParams(["month"]);
	return parsed.month;
}
