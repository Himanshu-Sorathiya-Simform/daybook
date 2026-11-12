import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type FormNoteProps = {
	/** What the note is about, as the component: `icon={Clock3}`. */
	icon: LucideIcon;
	children: ReactNode;
	className?: string;
};

/** A note at the top of a form, in a soft box with its icon, announced politely: "Your session
 * has expired. Log in to continue." A refusal of the form is a `FormAlert` instead. */
export function FormNote({
	icon: Icon,
	children,
	className,
}: Readonly<FormNoteProps>) {
	return (
		<div
			role="status"
			className={cn(
				"rounded-control bg-soft text-label text-ink flex items-start gap-2.5 px-3 py-2.5 font-medium",
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0"
			/>
			<span>{children}</span>
		</div>
	);
}
