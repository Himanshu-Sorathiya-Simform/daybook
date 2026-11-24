"use client";

import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import type { Month } from "@/lib/budgets/months";
import type { BudgetRecord } from "@/lib/budgets/view";
import { DIALOG_TEXT, type DialogScope, oneMonthDetail } from "../lib/dialog";
import type { Formats } from "../lib/labels";

export type ForHowLongFieldProps = {
	value: DialogScope;
	onChange: (scope: DialogScope) => void;
	/** The Budget record the change is over: its limit for the month shows in the detail. */
	record: BudgetRecord;
	month: Month;
	current: Month;
	formats: Formats;
	isDisabled?: boolean;
};

const FOR_HOW_LONG: DialogScope[] = ["onward", "month"];

/**
 * "For how long" in the Budget dialog (BR-F04-19, D-560): from the month onward, or for that
 * month only, with what the one month's limit goes back to said under it. A category with no
 * Budget record always applies from a month, so the dialog leaves this out for it.
 */
export function ForHowLongField({
	value,
	onChange,
	record,
	month,
	current,
	formats,
	isDisabled,
}: Readonly<ForHowLongFieldProps>) {
	return (
		<ChoiceGroup
			label={DIALOG_TEXT.forHowLong}
			value={value}
			onChange={(next) => onChange(next as DialogScope)}
			options={FOR_HOW_LONG.map((scope) => ({
				value: scope,
				label:
					scope === "onward" ? DIALOG_TEXT.onward : DIALOG_TEXT.oneMonth,
				description:
					scope === "onward" ?
						DIALOG_TEXT.onwardDetail
					:	oneMonthDetail(record, month, current, formats),
			}))}
			isDisabled={isDisabled ?? false}
		/>
	);
}
