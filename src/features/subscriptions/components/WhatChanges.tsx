import { Choice } from "@/components/forms/Choice";
import { cn } from "@/lib/cn";
import { DIALOG_TEXT } from "../lib/dialog";
import { alsoPastTitle, type EditView } from "../lib/edit-plan";
import { ChargesStrip } from "./ChargesStrip";

export type WhatChangesProps = {
	view: EditView;
	skipDouble: boolean;
	onSkipDoubleChange: (ticked: boolean) => void;
	alsoPast: boolean;
	onAlsoPastChange: (ticked: boolean) => void;
	isDisabled?: boolean;
	className?: string;
};

/**
 * An Edit's "What changes" (BR-F05-24), shown once a field other than the note changes and every
 * field is valid: the strip of charges around today; "Past charges stay as they are. The new
 * schedule applies from tomorrow." for a start or cadence change; what the amount, name or
 * category change means for charges; the double-charge choice, ticked, or "20 Oct has passed,
 * …"; "Also change the 2 past charges"; and the cost line.
 */
export function WhatChanges({
	view,
	skipDouble,
	onSkipDoubleChange,
	alsoPast,
	onAlsoPastChange,
	isDisabled = false,
	className,
}: Readonly<WhatChangesProps>) {
	const { doubleCharge } = view;
	return (
		<section
			aria-label={DIALOG_TEXT.whatChanges}
			className={cn(
				"border-line flex flex-col gap-2.5 border-t pt-3.5",
				className,
			)}
		>
			<h3 className="text-body text-ink font-semibold">
				{DIALOG_TEXT.whatChanges}
			</h3>
			<ChargesStrip items={view.strip} />
			{view.scheduleChanged && (
				<p className="text-body text-ink">{DIALOG_TEXT.schedule}</p>
			)}
			{view.values !== null && (
				<p className="text-body text-ink">{view.values}</p>
			)}
			{doubleCharge !== null && (
				<Choice
					label={doubleCharge.title}
					description={doubleCharge.description}
					isSelected={skipDouble}
					onChange={onSkipDoubleChange}
					isDisabled={isDisabled}
				/>
			)}
			{view.passed !== null && (
				<p className="text-body text-ink-2">{view.passed}</p>
			)}
			{view.alsoPast > 0 && (
				<Choice
					label={alsoPastTitle(view.alsoPast)}
					description={DIALOG_TEXT.alsoPastDetail}
					isSelected={alsoPast}
					onChange={onAlsoPastChange}
					isDisabled={isDisabled}
				/>
			)}
			{view.costLine !== null && (
				<p className="text-caption text-ink-2 figures">{view.costLine}</p>
			)}
		</section>
	);
}
