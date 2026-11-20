import { Info } from "lucide-react";

import { FormNote } from "@/components/feedback/FormNote";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { cn } from "@/lib/cn";
import type { PastChoices } from "../lib/dialog";

export type PastChargesProps = {
	choices: PastChoices;
	value: "no" | "yes";
	onChange: (value: "no" | "yes") => void;
	/** "You already have 2 Netflix expenses in that period, …", or `null`. */
	duplicates: string | null;
	isDisabled?: boolean;
	className?: string;
};

/**
 * Add's past-charges choice (BR-F05-04): a pair of choices under "Netflix started 14 months
 * before today. Add the charges from before?", "No, start with the next one" first and chosen,
 * and "Yes, add 14 past charges, ₹9,086.00". A note follows under either when expenses of the
 * same name already lie in that period.
 */
export function PastCharges({
	choices,
	value,
	onChange,
	duplicates,
	isDisabled = false,
	className,
}: Readonly<PastChargesProps>) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<ChoiceGroup
				label={choices.heading}
				value={value}
				onChange={(next) => onChange(next as "no" | "yes")}
				isDisabled={isDisabled}
				options={[
					{
						value: "no",
						label: choices.no.title,
						description: choices.no.description,
					},
					{
						value: "yes",
						label: choices.yes.title,
						description: choices.yes.description,
					},
				]}
			/>
			{duplicates !== null && <FormNote icon={Info}>{duplicates}</FormNote>}
		</div>
	);
}
