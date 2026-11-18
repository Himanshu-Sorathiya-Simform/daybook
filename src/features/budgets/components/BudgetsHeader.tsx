"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/actions/Button";
import { IconButton } from "@/components/actions/IconButton";
import { Segmented } from "@/components/forms/Segmented";
import { MonthPicker } from "@/components/navigation/MonthPicker";
import { type Month, monthRange, shiftMonth } from "@/lib/budgets/months";
import { formatMonth } from "@/lib/date-format";
import type { BudgetsView } from "../hooks/useBudgetsView";
import { monthLabel, PAGE_TEXT } from "../lib/messages";
import { MonthMenu } from "./MonthMenu";

export type BudgetsHeaderProps = {
	month: Month;
	current: Month;
	dateLocale: string;
	numberLocale: string;
	/** "as of 14:05" while offline, beside the title (section 10), or `null`. */
	asOf: string | null;
	onMonthChange: (month: Month) => void;
	view: BudgetsView;
	onViewChange: (view: BudgetsView) => void;
	onAdd: () => void;
};

/**
 * The page's header (BR-F04-14): the title, with "as of" while offline; the month control,
 * whose month opens the month grid; List or Table; and Add a Budget. Below 768 px (D-512) Add a
 * Budget is an icon button, List or Table leaves the header, and the month control takes its
 * own row with 44 px targets. CSS makes the change, so the server render needs no width.
 */
export function BudgetsHeader({
	month,
	current,
	dateLocale,
	numberLocale,
	asOf,
	onMonthChange,
	view,
	onViewChange,
	onAdd,
}: Readonly<BudgetsHeaderProps>) {
	const range = monthRange(current);
	return (
		<div className="flex flex-wrap items-center gap-3">
			<h1 className="text-title text-ink">{PAGE_TEXT.title}</h1>
			{asOf !== null && <span className="text-label text-ink-2">{asOf}</span>}
			<span className="flex-1" />
			<MonthPicker
				label={monthLabel(
					formatMonth(month, { dateLocale }),
					month === current,
				)}
				canPrev={month > range.first}
				canNext={month < range.last}
				onPrev={() => onMonthChange(shiftMonth(month, -1))}
				onNext={() => onMonthChange(shiftMonth(month, 1))}
				gridLabel={PAGE_TEXT.gridLabel}
				grid={(close) => (
					<MonthMenu
						value={month}
						current={current}
						range={range}
						dateLocale={dateLocale}
						numberLocale={numberLocale}
						onPick={onMonthChange}
						close={close}
					/>
				)}
				stretch="phone"
				className="max-md:order-last"
			/>
			<Segmented
				label={PAGE_TEXT.viewLabel}
				size="sm"
				options={[
					{ value: "list", label: PAGE_TEXT.list },
					{ value: "table", label: PAGE_TEXT.table },
				]}
				value={view}
				onChange={(next) =>
					onViewChange(next === "table" ? "table" : "list")
				}
				className="max-md:hidden"
			/>
			<Button
				icon={Plus}
				variant="secondary"
				onPress={onAdd}
				className="max-md:hidden"
			>
				{PAGE_TEXT.add}
			</Button>
			<IconButton
				icon={Plus}
				label={PAGE_TEXT.add}
				size="lg"
				onPress={onAdd}
				className="md:hidden"
			/>
		</div>
	);
}
