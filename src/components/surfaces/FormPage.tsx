import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type FormPageProps = {
	title: string;
	/** A line under the title, such as onboarding's "Four quick choices." */
	intro?: string;
	children: ReactNode;
	className?: string;
};

/** The frame of a page that is one form outside the app shell, such as sign-up, login and
 * onboarding: the name, linking home, then one titled column. */
export function FormPage({
	title,
	intro,
	children,
	className,
}: Readonly<FormPageProps>) {
	return (
		<main className="bg-page flex min-h-dvh justify-center px-4 py-12 md:items-center">
			<div className={cn("flex w-full max-w-sm flex-col gap-6", className)}>
				<Link
					href="/"
					className="text-heading text-ink self-start"
				>
					Daybook
				</Link>
				<div className="flex flex-col gap-2">
					<h1 className="text-title text-ink">{title}</h1>
					{intro && <p className="text-body text-ink-2">{intro}</p>}
				</div>
				{children}
			</div>
		</main>
	);
}
