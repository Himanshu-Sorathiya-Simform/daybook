"use client";

import { useId } from "react";

import { Select } from "@/components/forms/Select";
import { TextInput } from "@/components/forms/TextInput";
import { ToggleChips } from "@/components/forms/ToggleChips";
import { cn } from "@/lib/cn";
import type { CadenceUnit } from "@/lib/subscriptions/schedule";
import {
	CADENCE_CHOICES,
	type CadenceChoice,
	DIALOG_TEXT,
	everyText,
	UNIT_CHOICES,
} from "../lib/dialog";

export type CadenceFieldProps = {
	preset: CadenceChoice;
	onPresetChange: (preset: CadenceChoice) => void;
	/** The custom number as typed, and its unit. */
	every: string;
	onEveryChange: (every: string) => void;
	unit: CadenceUnit;
	onUnitChange: (unit: CadenceUnit) => void;
	/** The message for the custom number, which replaces its hint (BR-F05-24). */
	error?: string | undefined;
	/** "Was Monthly", on an Edit that changed it. */
	was?: string | undefined;
	isDisabled?: boolean;
	className?: string;
};

/**
 * "How often" (BR-F05-24): Weekly, Monthly, Every 3 months, Yearly or Custom. Custom shows
 * "Every" with a number of up to two digits, other characters dropped as typed, and "Unit",
 * weeks or months, with the hint "Every 2 months, every 6 months, every 2 weeks…", which the
 * error replaces as soon as the number is out of range. A custom cadence equal to a preset is
 * saved as that preset.
 */
export function CadenceField({
	preset,
	onPresetChange,
	every,
	onEveryChange,
	unit,
	onUnitChange,
	error,
	was,
	isDisabled = false,
	className,
}: Readonly<CadenceFieldProps>) {
	const hintId = useId();
	return (
		<div className={cn("flex flex-col gap-1.25", className)}>
			<span className="text-caption text-ink font-semibold">
				{DIALOG_TEXT.howOften}
			</span>
			<ToggleChips
				label={DIALOG_TEXT.howOften}
				selectionMode="single"
				options={CADENCE_CHOICES}
				value={[preset]}
				onChange={([next]) => {
					if (next !== undefined) onPresetChange(next as CadenceChoice);
				}}
				isDisabled={isDisabled}
			/>
			{preset === "custom" && (
				<div className="flex flex-col gap-1.25">
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
						<TextInput
							label={DIALOG_TEXT.every}
							inputMode="numeric"
							value={every}
							onChange={(text) => onEveryChange(everyText(text))}
							aria-describedby={hintId}
							error={error}
							isDisabled={isDisabled}
						/>
						<Select
							label={DIALOG_TEXT.unit}
							options={UNIT_CHOICES.map(({ value, label }) => ({
								value,
								label,
							}))}
							value={unit}
							onChange={(next) => onUnitChange(next as CadenceUnit)}
							isDisabled={isDisabled}
						/>
					</div>
					{/* Its error replaces it, under the number it is about. */}
					{!error && (
						<p
							id={hintId}
							className="text-caption text-ink-3"
						>
							{DIALOG_TEXT.customHint}
						</p>
					)}
				</div>
			)}
			{was !== undefined && <p className="text-caption text-ink-2">{was}</p>}
		</div>
	);
}
