import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type SectionProps = {
	/** The heading. With a title the section is a named landmark. */
	title?: string;
	/** The one text action in the heading row, for example a link to "View all". It is a slot,
	 * so the page chooses a link or a button. */
	action?: ReactNode;
	/** An element after the title, for example `<Badge>Simulated</Badge>`. */
	badge?: ReactNode;
	children?: ReactNode;
	as?: "section" | "div" | "article";
	/** Classes for the root element. Padding, a grid or a height go here. */
	className?: string;
};

/**
 * The only container for page content: a 1px hairline frame, no shadow, so the page stays one
 * surface. The gap between sections is the page's job.
 */
export function Section({
	title,
	action,
	badge,
	children,
	as: Tag = "section",
	className,
}: SectionProps) {
	const headingId = useId();
	return (
		<Tag
			aria-labelledby={title ? headingId : undefined}
			className={cn(
				"rounded-section border-line bg-section min-w-0 border px-6 py-5.5 max-md:px-4.5 max-md:py-4.5",
				className,
			)}
		>
			{title && (
				<div className="mb-3.5 flex items-baseline gap-2.5">
					<h2
						id={headingId}
						className="text-heading text-ink"
					>
						{title}
					</h2>
					{badge}
					<span className="flex-1" />
					{action && <div className="text-label">{action}</div>}
				</div>
			)}
			{children}
		</Tag>
	);
}
