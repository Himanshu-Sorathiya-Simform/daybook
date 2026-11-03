"use client";

import { EmptyState } from "@/components/feedback/EmptyState";
import { cn } from "@/lib/cn";

export type PlaceholderPageProps = {
	/** The destination's name, as the sidebar shows it. */
	name: string;
	className?: string;
};

/** What a navigation item opens until its feature is built (D-504, D-514). */
export function PlaceholderPage({
	name,
	className,
}: Readonly<PlaceholderPageProps>) {
	return (
		<div className={cn("flex flex-col gap-6 px-8 py-7 max-md:px-4", className)}>
			<h1 className="text-title text-ink">{name}</h1>
			<EmptyState
				title={`${name} is coming soon.`}
				body="It arrives in a later update."
			/>
		</div>
	);
}
