import { PiggyBank } from "lucide-react";

import { CATEGORY_ICONS } from "@/components/data/categoryIcons";
import { categoryColor, type CategoryKey } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/initials";

export type AvatarProps = {
	/** The payee; the initials come from its first two words (BR-F03-32). */
	payee?: string;
	category?: CategoryKey;
	/** A Goal Transaction shows a piggy bank instead of initials. */
	goal?: boolean;
	/** A pending row has a dashed edge. */
	pending?: boolean;
	size?: "sm" | "md" | "lg";
	className?: string;
};

const sizes = {
	sm: { box: "size-7 text-axis", icon: "size-3.25" },
	md: { box: "size-9 text-small", icon: "size-4" },
	lg: { box: "size-11 text-body", icon: "size-5" },
};

/**
 * A Transaction row's avatar: the payee's initials on a light tint of the category colour. With
 * no letters or digits it shows the category icon. It is hidden from screen readers, because the
 * row's title already names the payee.
 */
export function Avatar({
	payee = "",
	category = "other",
	goal = false,
	pending = false,
	size = "md",
	className,
}: Readonly<AvatarProps>) {
	const color = categoryColor(goal ? "salary" : category);
	const letters = goal ? "" : initials(payee);
	const CategoryIcon = CATEGORY_ICONS[category];
	return (
		<span
			aria-hidden="true"
			className={cn(
				"text-ink inline-flex shrink-0 items-center justify-center rounded-full font-bold",
				sizes[size].box,
				pending && "border-edge border-[1.5px] border-dashed",
				className,
			)}
			style={{ background: `color-mix(in oklab, ${color} 16%, var(--page))` }}
		>
			{goal ?
				<PiggyBank
					className={sizes[size].icon}
					style={{ color }}
				/>
			:	letters || (
					<CategoryIcon
						className={sizes[size].icon}
						style={{ color }}
					/>
				)
			}
		</span>
	);
}
