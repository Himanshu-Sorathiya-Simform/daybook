import { queryOptions, skipToken } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { Month } from "@/lib/budgets/months";
import { sameNameExpenses } from "./duplicates";
import { subscriptionKeys } from "./keys";
import { fetchEveryPage } from "./pages";
import {
	duplicatesPath,
	monthChargesPath,
	monthsPath,
	SUBSCRIPTIONS_PATH,
	subscriptionChargesPath,
} from "./paths";
import type { SubscriptionList, SubscriptionMonthsAnswer } from "./types";

/** Every Subscription with its derived figures, the totals, the next 30 days and this month
 * (F05 section 11). */
export function subscriptionListOptions() {
	return queryOptions({
		queryKey: subscriptionKeys.list(),
		queryFn: ({ signal }) =>
			apiFetch<SubscriptionList>(SUBSCRIPTIONS_PATH, { signal }),
	});
}

/** Each month from `from` to `to`, charged and expected, for the calendar's month row
 * (BR-F05-36, BR-F05-38). */
export function subscriptionMonthsOptions(from: Month, to: Month) {
	return queryOptions({
		queryKey: subscriptionKeys.months(from, to),
		queryFn: ({ signal }) =>
			apiFetch<SubscriptionMonthsAnswer>(monthsPath(from, to), { signal }),
	});
}

/** Every charge dated in `month`, deleted Subscriptions' included, for the calendar
 * (BR-F05-38, BR-F05-48). */
export function monthChargesOptions(month: Month) {
	return queryOptions({
		queryKey: subscriptionKeys.monthCharges(month),
		queryFn: ({ signal }) =>
			fetchEveryPage((cursor) => monthChargesPath(month, cursor), signal),
	});
}

/** Every linked charge of one Subscription, for its timeline and the previews of Edit, Cancel
 * and Resume (BR-F05-40, BR-F05-48). With no id it asks for nothing. */
export function subscriptionChargesOptions(id: string | null) {
	return queryOptions({
		queryKey: subscriptionKeys.charges(id),
		queryFn:
			id === null ? skipToken : (
				({ signal }) =>
					fetchEveryPage(
						(cursor) => subscriptionChargesPath(id, cursor),
						signal,
					)
			),
	});
}

/** What Add's duplicate note reads (BR-F05-04, BR-F05-48): the expenses from `from` to `to`
 * whose payee equals `name`, newest first. `name` is the text `duplicateSearchText` accepted.
 * With none it asks for nothing. */
export function duplicatesOptions(
	read: { name: string; from: string; to: string } | null,
) {
	return queryOptions({
		queryKey: subscriptionKeys.duplicates(
			read?.name ?? null,
			read?.from ?? "",
			read?.to ?? "",
		),
		queryFn:
			read === null ? skipToken : (
				async ({ signal }) =>
					sameNameExpenses(
						await fetchEveryPage(
							(cursor) =>
								duplicatesPath(
									read.name,
									read.from,
									read.to,
									cursor,
								),
							signal,
						),
						read.name,
					)
			),
	});
}
