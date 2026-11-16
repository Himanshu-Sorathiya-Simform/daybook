"use client";

import { useId, useState } from "react";

import type { Month } from "@/lib/budgets/months";
import type { BudgetChange, BudgetPreview } from "@/lib/budgets/preview";
import { cn } from "@/lib/cn";
import {
	type Figures,
	onwardCaption,
	PREVIEW_TEXT,
	type PreviewContext,
} from "../lib/preview";
import { PreviewCards } from "./PreviewCards";
import { PreviewStrip } from "./PreviewStrip";
import { PreviewTable } from "./PreviewTable";

export type WhatChangesProps = {
	preview: Extract<BudgetPreview, { blocked: false }>;
	change: BudgetChange;
	context: PreviewContext;
	figures: Figures;
	className?: string;
};

/** From this many months a change is a strip and a table instead of cards (BR-F04-26). */
const STRIP_FROM = 5;

/**
 * "What changes" (BR-F04-26): cards for up to 4 months, and from 5 months a strip with a table
 * of the months that change; a change from a month onward is captioned "3 months, then every
 * month after". The strip and the table follow one another: the row under the pointer tints
 * its months in the strip. Without spending (offline, or its read failed) every month shows
 * its limits alone and the strip is left out, since it draws spending (section 10).
 */
export function WhatChanges({
	preview,
	change,
	context,
	figures,
	className,
}: Readonly<WhatChangesProps>) {
	const heading = useId();
	const [highlight, setHighlight] = useState<{
		first: Month;
		last: Month;
	} | null>(null);
	const long = preview.months.length >= STRIP_FROM;
	const [firstMonth] = preview.months;
	return (
		<section
			aria-labelledby={heading}
			className={cn("flex flex-col gap-2", className)}
		>
			<div className="flex items-baseline gap-2">
				<h3
					id={heading}
					className="text-caption text-ink font-semibold"
				>
					{PREVIEW_TEXT.heading}
				</h3>
				<span className="flex-1" />
				{change.scope === "from" && firstMonth && (
					<span className="text-caption text-ink-2">
						{onwardCaption(
							firstMonth.month,
							preview.months.length,
							context.formats,
						)}
					</span>
				)}
			</div>
			{long ?
				<>
					{figures !== "missing" && (
						<PreviewStrip
							months={preview.months}
							highlight={highlight}
							isLoading={figures === "loading"}
							formats={context.formats}
						/>
					)}
					<PreviewTable
						preview={preview}
						change={change}
						context={context}
						figures={figures}
						onHighlight={setHighlight}
					/>
				</>
			:	<PreviewCards
					preview={preview}
					change={change}
					context={context}
					figures={figures}
				/>
			}
		</section>
	);
}
