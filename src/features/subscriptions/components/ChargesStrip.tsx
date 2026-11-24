import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/cn";
import { DIALOG_TEXT } from "../lib/dialog";
import type { StripItem, StripItemKind } from "../lib/edit-plan";

export type ChargesStripProps = {
	items: readonly StripItem[];
	className?: string;
};

/** What a cell looks like by its kind: a charge as it stays has a dashed edge, a new one a
 * solid edge, and one that goes is struck through, so no meaning is colour alone. */
const CELLS: Record<Exclude<StripItemKind, "today" | "more">, string> = {
	kept: "border-dashed border-line-strong text-ink-2",
	off: "border-dashed border-line-strong text-ink-2",
	new: "border-line-strong text-ink",
};

/** An amount: struck through when the charge goes, bold at the new value. */
function amountOf(kind: StripItemKind, amount: string) {
	if (kind === "off") return <s>{amount}</s>;
	if (kind === "new") return <b className="font-semibold">{amount}</b>;
	return <span>{amount}</span>;
}

/**
 * The strip of charges around today (BR-F05-24), named "Charges around today": the last two
 * charges as they stay, "Today", the old next charge struck as "moves", the date offered as a
 * skip, and the next two charges at the new values. "Today" is hidden from screen readers.
 */
export function ChargesStrip({ items, className }: Readonly<ChargesStripProps>) {
	return (
		<ul
			aria-label={DIALOG_TEXT.stripLabel}
			className={cn("flex items-stretch gap-1.5 pt-4.5", className)}
		>
			{items.map((item) => {
				// A cell is told apart by its kind and its date or word.
				const key = `${item.kind}:${item.label}`;
				if (item.kind === "today") {
					return (
						<li
							key={key}
							aria-hidden="true"
							className="bg-ink relative w-0.5 flex-none rounded-xs"
						>
							<span className="text-small text-ink-2 absolute -top-4.5 -left-3.5 font-semibold">
								{DIALOG_TEXT.today}
							</span>
						</li>
					);
				}
				if (item.kind === "more") {
					return (
						<li
							key={key}
							aria-hidden="true"
							className="text-ink-3 grid flex-[0.5] place-items-center"
						>
							<ArrowRight className="size-3.5" />
						</li>
					);
				}
				return (
					<li
						key={key}
						className={cn(
							"rounded-control text-caption figures flex min-w-0 flex-1 flex-col gap-px border px-1 py-1.5 text-center",
							CELLS[item.kind],
						)}
					>
						<span className="text-small text-ink-3 font-medium">
							{item.label}
						</span>
						{item.amount !== undefined
							&& amountOf(item.kind, item.amount)}
						{item.note !== undefined && (
							<span
								className={cn(
									"text-small",
									item.warn ?
										"text-neg font-medium"
									:	"text-ink-3",
								)}
							>
								{item.note}
							</span>
						)}
					</li>
				);
			})}
		</ul>
	);
}
