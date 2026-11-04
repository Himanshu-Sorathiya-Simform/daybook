"use client";

import { useEffect } from "react";

import { Banner } from "@/components/feedback/Banner";
import { showToast } from "@/components/feedback/showToast";
import { useOnline } from "@/hooks/useOnline";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/date-format";
import type { WeekStart } from "@/lib/geo";
import { matchesFilter } from "@/lib/transactions/match";
import { useCreatedAnswer, useEntryDialog } from "../hooks/useEntryDialog";
import { useTransactionSummary } from "../hooks/useTransactionSummary";
import { useTransactionsUrl } from "../hooks/useTransactionsUrl";
import { ENTRY_TEXT } from "../lib/entry";
import type { LabelLocale } from "../lib/labels";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import { FilterBar } from "./FilterBar";
import { HeaderTotals } from "./HeaderTotals";
import { TransactionList } from "./TransactionList";

export type TransactionsPageProps = {
	/** The profile's formats and its today, from the server render (TIME-5). */
	locale: LabelLocale;
	/** The profile's week start, the first column of the calendars (D-537). */
	weekStart: WeekStart;
	className?: string;
};

/**
 * The Transactions page (F03 section 6), from top to bottom: the title, with "as of" while
 * offline (D-533); the search box, the filter controls and the Group · Sort menu, then the
 * active filters as chips; the invalid-link notice (D-531); the header totals; and the list. Everything follows the URL (FIL-4), which the page reads and writes through
 * `useTransactionsUrl`.
 *
 * It answers the entry dialog's creates (BR-F03-21, BR-F03-22, D-548): a plain Save of a row the
 * filter shows selects it, and a row the filter hides says so, with Show to clear the filters.
 * `new=1` opens the dialog, and closing it removes the parameter (BR-F03-53).
 */
export function TransactionsPage({
	locale,
	weekStart,
	className,
}: Readonly<TransactionsPageProps>) {
	const url = useTransactionsUrl(locale.currency);
	const online = useOnline();
	const summary = useTransactionSummary({
		filter: url.filter,
		currency: locale.currency,
	});
	const entry = useEntryDialog();

	useCreatedAnswer((row, kind) => {
		if (!matchesFilter(row, url.filter, locale.currency)) {
			showToast(ENTRY_TEXT.hidden, {
				action: ENTRY_TEXT.show,
				onAction: () => url.setFilter({}),
			});
			return;
		}
		if (kind === "save") url.select(row.id);
		showToast(ENTRY_TEXT.saved);
	});

	const { isNew, setNew } = url;
	useEffect(() => {
		if (isNew) entry.openNew({ onClose: () => setNew(false) });
	}, [isNew, entry, setNew]);

	return (
		<div
			className={cn(
				"flex flex-col gap-3.5 px-8 py-7 max-md:px-4 max-md:py-5",
				className,
			)}
		>
			<div className="flex flex-wrap items-baseline gap-x-3.5">
				<h1 className="text-title text-ink">Transactions</h1>
				{!online && summary.dataUpdatedAt > 0 && (
					<span className="text-label text-ink-2">
						as of {formatTime(new Date(summary.dataUpdatedAt), locale)}
					</span>
				)}
			</div>
			<FilterBar
				filter={url.filter}
				list={url.list}
				onFilterChange={(filter, mode) =>
					url.setFilter(filter, url.list, mode)
				}
				onListChange={url.setList}
				locale={locale}
				firstDayOfWeek={weekStart}
				count={summary.data?.count}
				isOffline={!online}
			/>
			{url.notice && (
				<Banner
					kind="info"
					action="Dismiss"
					className="rounded-section border"
					onAction={url.dismissNotice}
				>
					{TRANSACTIONS_TEXT.invalidLink}
				</Banner>
			)}
			<HeaderTotals
				summary={summary.data}
				isError={
					summary.isError
					|| (!summary.data && summary.fetchStatus === "paused")
				}
				onRetry={() => void summary.refetch()}
				locale={locale}
			/>
			<TransactionList
				filter={url.filter}
				list={url.list}
				locale={locale}
				onClearFilters={() => url.setFilter({})}
				onAdd={() => entry.openNew()}
			/>
		</div>
	);
}
