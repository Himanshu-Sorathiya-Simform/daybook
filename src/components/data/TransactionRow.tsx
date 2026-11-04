"use client";

import { Avatar } from "@/components/data/Avatar";
import { Badge } from "@/components/data/Badge";
import { Money } from "@/components/data/Money";
import { categoryColor, categoryLabel, type CategoryKey } from "@/lib/categories";
import { cn } from "@/lib/cn";
import type { CurrencyCode } from "@/lib/currency";

export type TransactionRowProps = {
	/** The payee, or "To Vacation" and "From Vacation" on a Goal row (BR-F03-32). */
	title: string;
	/** The payee, for the avatar's initials. A Goal row has none. */
	payee?: string;
	/** Left out on a Goal row, which shows no category. */
	category?: CategoryKey;
	/** A Goal row: the Goal's icon, and no category or subtitle text before the time. */
	goal?: boolean;
	/** Shown in place of the category label. */
	description?: string;
	/** The time ("10:15 pm"), "Auto" for a charge, or the day and time outside day grouping
	 * ("Sat, 31 Oct · 10:15 pm"), as the list words it (BR-F03-31). */
	when: string;
	/** `pending` shows "Pending sync" and a dashed avatar; `rejected` shows "Not saved". */
	status?: "confirmed" | "pending" | "rejected";
	/** The signed amount in minor units (D-231): positive when money becomes free to spend. */
	amountMinor: number;
	currency: CurrencyCode;
	/** The profile's number format (MON-4). */
	numberLocale: string;
	/** `compact` is 46px tall instead of 54px. */
	density?: "comfortable" | "compact";
	className?: string;
};

/**
 * One Transaction as the lists show it (BR-F03-32, D-528): the avatar; the title; a subtitle of
 * a dot in the category's colour, the description or else the category label, and the time;
 * any badge; and the signed amount, which never wraps. It is markup only, with no role: the list
 * that holds it gives the row its role, selection and keyboard. With a description, the category
 * label is read to screen readers, so the dot is never the only sign of it.
 */
export function TransactionRow({
	title,
	payee = "",
	category = "other",
	goal = false,
	description,
	when,
	status = "confirmed",
	amountMinor,
	currency,
	numberLocale,
	density = "comfortable",
	className,
}: Readonly<TransactionRowProps>) {
	const label = categoryLabel(category);
	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-3.5",
				density === "compact" ? "h-11.5" : "h-13.5",
				className,
			)}
		>
			<Avatar
				payee={payee}
				category={category}
				goal={goal}
				pending={status === "pending"}
				size={density === "compact" ? "sm" : "md"}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-px">
				<span className="text-body-lg text-ink truncate font-semibold">
					{title}
				</span>
				<span className="text-caption text-ink-2 flex min-w-0 items-center gap-1.5">
					{!goal && (
						<span
							aria-hidden="true"
							className="size-1.75 shrink-0 rounded-full"
							style={{ background: categoryColor(category) }}
						/>
					)}
					<span className="truncate">
						{!goal && description && (
							<span className="sr-only">{label}: </span>
						)}
						{!goal && `${description || label} · `}
						{when}
					</span>
				</span>
			</div>
			{status === "pending" && <Badge tone="pending">Pending sync</Badge>}
			{status === "rejected" && <Badge tone="error">Not saved</Badge>}
			<Money
				minor={amountMinor}
				currency={currency}
				numberLocale={numberLocale}
				sign="always"
				tone="signed"
				className="text-amount shrink-0 text-right"
			/>
		</div>
	);
}
