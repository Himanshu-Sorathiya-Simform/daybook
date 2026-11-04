"use client";

import { Banner } from "@/components/feedback/Banner";
import { useOnline } from "@/hooks/useOnline";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/date-format";
import { useTransactionSummary } from "../hooks/useTransactionSummary";
import { useTransactionsUrl } from "../hooks/useTransactionsUrl";
import type { LabelLocale } from "../lib/labels";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import { GroupSortMenu } from "./GroupSortMenu";
import { HeaderTotals } from "./HeaderTotals";
import { TransactionList } from "./TransactionList";

export type TransactionsPageProps = {
	/** The profile's formats and its today, from the server render (TIME-5). */
	locale: LabelLocale;
	className?: string;
};

/**
 * The Transactions page (F03 section 6), from top to bottom: the title, with "as of" while
 * offline (D-533); the invalid-link notice (D-531); the Group · Sort menu; the header totals;
 * and the list. Everything follows the URL (FIL-4), which the page reads and writes through
 * `useTransactionsUrl`.
 */
export function TransactionsPage({
	locale,
	className,
}: Readonly<TransactionsPageProps>) {
	const url = useTransactionsUrl(locale.currency);
	const online = useOnline();
	const summary = useTransactionSummary({
		filter: url.filter,
		currency: locale.currency,
	});

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
			<div className="flex flex-wrap items-center justify-end gap-2">
				<GroupSortMenu
					list={url.list}
					onChange={url.setList}
				/>
			</div>
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
			/>
		</div>
	);
}
