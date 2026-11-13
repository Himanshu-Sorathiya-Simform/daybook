"use client";

import { useState } from "react";

import { Button } from "@/components/actions/Button";
import { MonthGrid } from "@/components/navigation/MonthGrid";
import type { Month, MonthRange } from "@/lib/budgets/months";
import { formatPercent } from "@/lib/money";
import { useBudgetYear } from "../hooks/useBudgetYear";
import { PAGE_TEXT } from "../lib/messages";

export type MonthMenuProps = {
	/** The month the page shows. */
	value: Month;
	/** The profile's current month. */
	current: Month;
	range: MonthRange;
	dateLocale: string;
	numberLocale: string;
	/** Shows a month; the menu closes after it. */
	onPick: (month: Month) => void;
	/** Closes the popover the menu sits in. */
	close: () => void;
};

/**
 * The header's month grid (BR-F04-14): the year shown, with each month's overall utilization
 * ("81.0%") under it, nothing for a month with no Budget, and no figures while the year
 * summary is loading or cannot load (section 10). Under it, the caption and This month. Moving
 * to another year loads that year's figures.
 */
export function MonthMenu({
	value,
	current,
	range,
	dateLocale,
	numberLocale,
	onPick,
	close,
}: Readonly<MonthMenuProps>) {
	const [year, setYear] = useState(() => Number(value.slice(0, 4)));
	const summary = useBudgetYear(year);
	const figures: Partial<Record<Month, string>> = {};
	for (const { month, utilizationTenths } of summary.data?.months ?? []) {
		if (utilizationTenths !== null) {
			figures[month] = formatPercent(utilizationTenths, 1000, numberLocale);
		}
	}
	const pick = (month: Month) => {
		onPick(month);
		close();
	};
	return (
		<>
			<MonthGrid
				value={value}
				onChange={pick}
				onYearChange={setYear}
				range={range}
				current={current}
				dateLocale={dateLocale}
				figures={figures}
				autoFocus
			/>
			<div className="border-line flex items-center gap-2 border-t pt-2">
				<span className="text-caption text-ink-3 flex-1">
					{PAGE_TEXT.gridCaption}
				</span>
				<Button
					size="sm"
					variant="secondary"
					onPress={() => pick(current)}
				>
					{PAGE_TEXT.thisMonth}
				</Button>
			</div>
		</>
	);
}
