import { CATEGORY_ICONS } from "@/components/data/categoryIcons";
import { categoryColor, categoryLabel, type CategoryKey } from "@/lib/categories";
import { cn } from "@/lib/cn";

export type CategoryTagProps = {
	category: CategoryKey;
	/** `label` is the icon and the name (legends, Budgets); `dot` is a small dot and the name
	 * (row subtitles); `icon` is the icon alone, named for screen readers. */
	variant?: "label" | "dot" | "icon";
	className?: string;
};

/** The only way to show a category: its fixed colour with its fixed icon or name, never colour
 * alone. */
export function CategoryTag({
	category,
	variant = "label",
	className,
}: CategoryTagProps) {
	const color = categoryColor(category);
	const label = categoryLabel(category);
	const Icon = CATEGORY_ICONS[category];

	if (variant === "icon") {
		return (
			<Icon
				role="img"
				aria-label={label}
				className={cn("size-4.5 shrink-0", className)}
				style={{ color }}
			/>
		);
	}
	if (variant === "dot") {
		return (
			<span
				className={cn(
					"text-caption text-ink-2 inline-flex items-center gap-1.5 whitespace-nowrap",
					className,
				)}
			>
				<span
					aria-hidden="true"
					className="size-1.75 rounded-full"
					style={{ background: color }}
				/>
				{label}
			</span>
		);
	}
	return (
		<span
			className={cn(
				"text-body text-ink inline-flex items-center gap-2 font-semibold whitespace-nowrap",
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className="size-4.5 shrink-0"
				style={{ color }}
			/>
			{label}
		</span>
	);
}
