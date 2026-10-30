import { cn } from "@/lib/cn";
import type { CurrencyCode } from "@/lib/currency";
import { formatMoney } from "@/lib/money";

type Shared = { className?: string };

export type PendingNoteProps = Shared
	& (
		| {
				/** A pending change in minor units, shown as "+₹300.00 pending". */
				minor: number;
				currency: CurrencyCode;
				numberLocale: string;
				count?: never;
				label?: never;
		  }
		| {
				/** A count, shown as "+1 pending". */
				count: number;
				minor?: never;
				label?: never;
		  }
		| {
				/** Your own text, such as "Pending sync". */
				label: string;
				minor?: never;
				count?: never;
		  }
	);

function pendingText(props: Readonly<PendingNoteProps>): string {
	if (props.label !== undefined) return props.label;
	if (props.count !== undefined) return `+${props.count} pending`;
	const amount = formatMoney(props.minor, props.currency, props.numberLocale, {
		signDisplay: "always",
	});
	return `${amount} pending`;
}

/**
 * The one pending signal: a dashed outline with ink-2 text. It sits beside a confirmed figure
 * and never replaces it or is added into it.
 */
export function PendingNote(props: Readonly<PendingNoteProps>) {
	const text = pendingText(props);
	return (
		<span
			className={cn(
				"figures rounded-chip border-edge text-small text-pending inline-flex items-center border-[1.5px] border-dashed px-2.25 py-px whitespace-nowrap",
				props.className,
			)}
		>
			{text}
		</span>
	);
}
