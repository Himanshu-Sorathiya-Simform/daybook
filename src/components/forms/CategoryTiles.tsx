"use client";

import { type CSSProperties, useId } from "react";
import {
	Button as AriaButton,
	RadioButton as AriaRadioButton,
	RadioField as AriaRadioField,
	RadioGroup as AriaRadioGroup,
} from "react-aria-components";

import { CATEGORY_ICONS } from "@/components/data/categoryIcons";
import { Field } from "@/components/forms/Field";
import { type CategoryKey, categoryColor, categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";

export type CategoryTilesProps = {
	/** The tiles in order. */
	tiles: readonly CategoryKey[];
	/** A line under a tile's label, for some or all of them: "₹450.00 in Sep" (BR-F04-19). It
	 * is read out with the tile. */
	captions?: Partial<Record<CategoryKey, string>>;
	/** How many the collapsed tiles leave out; with none, there is no "+ N more". */
	rest?: number;
	isExpanded?: boolean;
	onExpandedChange?: (isExpanded: boolean) => void;
	value: CategoryKey | null;
	onChange: (value: CategoryKey) => void;
	/** "From your last Swiggy Transaction", after a payee filled it in (BR-F03-45). */
	hint?: string | undefined;
	error?: string | undefined;
	isDisabled?: boolean;
	/** Focus goes to the first tile when the tiles first show. */
	autoFocus?: boolean;
	className?: string;
};

/**
 * The category, as tiles of icon and label (BR-F03-75, D-525), with an optional caption under
 * the label (BR-F04-19): a radio group, so Tab lands on the chosen tile and the arrow keys move
 * and choose. The chosen tile takes its category's
 * colour, with a heavier edge and bolder label, so colour is never the only sign. "+ 8 more"
 * adds the rest after the tiles shown, and "Show fewer" takes them away again (D-550).
 *
 * The hint comes and goes after the group first renders, and React Aria looks for a field's
 * description only when its error changes, so the group links its hint itself.
 */
export function CategoryTiles({
	tiles,
	captions,
	rest = 0,
	isExpanded = false,
	onExpandedChange,
	value,
	onChange,
	hint,
	error,
	isDisabled = false,
	autoFocus = false,
	className,
}: Readonly<CategoryTilesProps>) {
	const hintId = useId();
	const showHint = hint !== undefined && !error;
	return (
		<AriaRadioGroup
			{...(showHint ? { "aria-describedby": hintId } : {})}
			value={value}
			onChange={(key) => onChange(key as CategoryKey)}
			isInvalid={Boolean(error)}
			isDisabled={isDisabled}
			className={cn("flex flex-col", className)}
		>
			<Field
				label="Category"
				error={error}
			>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5">
					{tiles.map((key, index) => {
						const Icon = CATEGORY_ICONS[key];
						return (
							<AriaRadioField
								key={key}
								value={key}
								autoFocus={autoFocus && index === 0}
								style={
									{ "--tile": categoryColor(key) } as CSSProperties
								}
								className="flex"
							>
								<AriaRadioButton
									className={cn(
										"rounded-control border-line-strong bg-page text-caption text-ink flex min-h-14.5 flex-1 cursor-pointer flex-col items-center justify-center gap-1 border px-1 py-1.5 text-center font-medium",
										"selected:border-(--tile) selected:bg-(--tile)/14 selected:font-semibold selected:ring-1 selected:ring-(--tile) selected:ring-inset",
										"focus-visible:focus-ring",
										"disabled:text-ink-3 disabled:cursor-not-allowed",
									)}
								>
									<Icon
										aria-hidden="true"
										className="size-4.25 shrink-0 text-(--tile)"
									/>
									{categoryLabel(key)}
									{captions?.[key] && (
										<span className="text-small text-ink-2 figures font-normal">
											{/* Read as "Health, ₹1,500.00 in Sept", not run together. */}
											<span className="sr-only">,</span>{" "}
											{captions[key]}
										</span>
									)}
								</AriaRadioButton>
							</AriaRadioField>
						);
					})}
					{rest > 0 && (
						<AriaButton
							aria-expanded={isExpanded}
							isDisabled={isDisabled}
							onPress={() => onExpandedChange?.(!isExpanded)}
							className="rounded-control border-edge text-accent focus-visible:focus-ring disabled:text-ink-3 text-caption flex h-14.5 cursor-pointer items-center justify-center border-[1.5px] border-dashed font-semibold disabled:cursor-not-allowed"
						>
							{isExpanded ?
								"Show fewer"
							:	<>
									+ {rest} more{" "}
									<span className="sr-only">categories</span>
								</>
							}
						</AriaButton>
					)}
				</div>
			</Field>
			{showHint && (
				<p
					id={hintId}
					className="text-caption text-ink-3 mt-1.25"
				>
					{hint}
				</p>
			)}
		</AriaRadioGroup>
	);
}
