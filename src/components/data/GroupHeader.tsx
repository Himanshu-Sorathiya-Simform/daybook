import { cn } from "@/lib/cn";

export type GroupHeaderProps = {
	/** "Today", "Yesterday · Sun, 1 Nov", "4 · Food" or "Vacation (Goal)" (BR-F03-31, D-522). */
	label: string;
	/** The group's figures that are not zero, as "In ₹85,000.00 · Out ₹18,000.00" (D-522).
	 * Left out when there are none to show. */
	figures?: string;
	className?: string;
};

/** The header above a group of Transaction rows: its label on the left and its figures on the
 * right, which never wrap. Markup only: the list that holds it gives it its role. */
export function GroupHeader({
	label,
	figures,
	className,
}: Readonly<GroupHeaderProps>) {
	return (
		<div
			className={cn(
				"text-caption text-ink-2 flex items-baseline gap-3 pt-4 pb-1 font-semibold",
				className,
			)}
		>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{figures && (
				<>
					{/* A space keeps the label and the figures apart when read. */}{" "}
					<span className="figures shrink-0 whitespace-nowrap">
						{figures}
					</span>
				</>
			)}
		</div>
	);
}
