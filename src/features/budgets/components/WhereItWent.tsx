"use client";

import { useId } from "react";

import { Avatar } from "@/components/data/Avatar";
import { Money } from "@/components/data/Money";
import { Skeleton } from "@/components/feedback/Skeleton";
import { TextLink } from "@/components/navigation/TextLink";
import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import { cn } from "@/lib/cn";
import type { BudgetPayees } from "../hooks/useBudgetPayees";
import type { Formats } from "../lib/labels";
import { seeTransactions, whereItWent } from "../lib/panel";
import { transactionsHref } from "../lib/paths";
import { TOP_PAYEES } from "../lib/queries";
import { LineSkeleton } from "./LineSkeleton";

export type WhereItWentProps = {
	category: ExpenseCategory;
	month: Month;
	/** The top payees by net spending and the month's number of Transactions, or undefined
	 * while they load. */
	payees: BudgetPayees | undefined;
	formats: Formats;
	className?: string;
};

const ROW = "flex h-9 items-center gap-2.5";

/** While the payees load: as many rows as can show, and the link, sized like the real ones. */
const SKELETON = (
	<>
		<ul aria-hidden="true">
			{Array.from({ length: TOP_PAYEES }, (_, row) => (
				<li
					key={row}
					className={ROW}
				>
					<Skeleton className="size-7 rounded-full" />
					<LineSkeleton
						size="body"
						width="w-24"
						className="flex-1"
					/>
					<LineSkeleton
						size="body"
						width="w-20"
					/>
				</li>
			))}
		</ul>
		<LineSkeleton
			size="body"
			width="w-32"
			// The link's padding sits outside its line, as on the real link.
			className="box-content py-1.5"
		/>
	</>
);

/**
 * "Where it went in October" (BR-F04-30): the top payees by net spending, each with its avatar
 * and amount, then "See 4 Transactions", which opens the category's Transactions for the month
 * (BR-F04-17). While they load, the heading shows over skeleton rows and a skeleton link
 * (D-571).
 */
export function WhereItWent({
	category,
	month,
	payees,
	formats,
	className,
}: Readonly<WhereItWentProps>) {
	const heading = useId();
	return (
		<section
			aria-labelledby={heading}
			aria-busy={payees === undefined}
			className={cn("flex flex-col gap-1", className)}
		>
			<h3
				id={heading}
				className="text-body text-ink mb-0.5 font-semibold"
			>
				{whereItWent(month, formats)}
			</h3>
			{payees ?
				<>
					<ul>
						{payees.payees.map((payee) => {
							const name = payee.label ?? payee.key;
							return (
								<li
									key={payee.key}
									className={ROW}
								>
									<Avatar
										size="sm"
										payee={name}
										category={category}
									/>
									<span className="text-body text-ink min-w-0 flex-1 truncate font-medium">
										{name}
									</span>
									<Money
										minor={payee.outMinor}
										currency={formats.currency}
										numberLocale={formats.numberLocale}
										className="font-semibold"
									/>
								</li>
							);
						})}
					</ul>
					<TextLink
						href={transactionsHref(category, month, formats.currency)}
						className="text-body self-start py-1.5"
					>
						{seeTransactions(payees.count)}
					</TextLink>
				</>
			:	SKELETON}
		</section>
	);
}
