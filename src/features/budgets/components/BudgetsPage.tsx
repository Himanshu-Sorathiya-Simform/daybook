"use client";

import { Banner } from "@/components/feedback/Banner";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Section } from "@/components/surfaces/Section";
import { useOnline } from "@/hooks/useOnline";
import { monthOf } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import { formatMonth, formatTime } from "@/lib/date-format";
import { useBudgetMonth } from "../hooks/useBudgetMonth";
import { useBudgetsUrl } from "../hooks/useBudgetsUrl";
import { useBudgetsView } from "../hooks/useBudgetsView";
import { emptyTitle, offlineAction, offlineBody, PAGE_TEXT } from "../lib/messages";
import type { BudgetsLocale } from "../lib/types";
import { BudgetsHeader } from "./BudgetsHeader";
import { BudgetsSkeleton } from "./BudgetsSkeleton";

export type BudgetsPageProps = {
	/** The profile's formats and its today, from the server render (TIME-5). */
	locale: BudgetsLocale;
	/** Opens Add a Budget. */
	onAdd?: () => void;
	className?: string;
};

/**
 * The Budgets page (F04 section 6), from top to bottom: the header (BR-F04-14), the
 * invalid-link notice (FIL-5), then the month's state. Offline, only the current month shows,
 * with "as of" (section 10); another month says it isn't saved on this device. With nothing to
 * show and no connection, or a failed load, the error state offers Retry. Everything follows
 * the URL's `month` (BR-F04-14).
 */
export function BudgetsPage({
	locale,
	onAdd = () => {},
	className,
}: Readonly<BudgetsPageProps>) {
	const current = monthOf(locale.today);
	const url = useBudgetsUrl(current);
	const online = useOnline();
	const [view, setView] = useBudgetsView();
	const query = useBudgetMonth(url.month);
	const { dateLocale } = locale;

	const offOther = !online && url.month !== current;
	const asOf =
		!online && query.dataUpdatedAt > 0 ?
			`as of ${formatTime(new Date(query.dataUpdatedAt), locale)}`
		:	null;

	const body = () => {
		if (offOther) {
			return (
				<Section>
					<EmptyState
						title={PAGE_TEXT.offlineTitle}
						body={offlineBody(formatMonth(current, { dateLocale }))}
						action={offlineAction(
							formatMonth(current, { dateLocale }, "name"),
						)}
						onAction={() => url.setMonth(current)}
					/>
				</Section>
			);
		}
		const data = query.data;
		if (data) {
			// No Budget in the month (section 6).
			if (data.budgets.length === 0) {
				return (
					<Section>
						<EmptyState
							title={emptyTitle(
								formatMonth(url.month, { dateLocale }),
							)}
							body={PAGE_TEXT.emptyBody}
							action={PAGE_TEXT.add}
							onAction={onAdd}
						/>
					</Section>
				);
			}
			return null;
		}
		if (query.isError || query.fetchStatus === "paused") {
			return (
				<Section>
					<EmptyState
						title={PAGE_TEXT.loadFailed}
						body={PAGE_TEXT.loadFailedBody}
						action={PAGE_TEXT.retry}
						onAction={() => void query.refetch()}
					/>
				</Section>
			);
		}
		return <BudgetsSkeleton />;
	};

	return (
		<div
			className={cn(
				"flex flex-col gap-4 px-8 py-7 max-md:px-4 max-md:py-5",
				className,
			)}
		>
			<BudgetsHeader
				month={url.month}
				current={current}
				dateLocale={dateLocale}
				numberLocale={locale.numberLocale}
				asOf={asOf}
				onMonthChange={url.setMonth}
				view={view}
				onViewChange={setView}
				onAdd={onAdd}
			/>
			{url.notice && (
				<Banner
					kind="info"
					action={PAGE_TEXT.dismiss}
					className="rounded-section border"
					onAction={url.dismissNotice}
				>
					{PAGE_TEXT.invalidLink}
				</Banner>
			)}
			{body()}
		</div>
	);
}
