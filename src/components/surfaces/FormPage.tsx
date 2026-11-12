import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type FormPageProps = {
	title: string;
	/** A line under the title, such as onboarding's "Four quick choices." */
	intro?: string;
	children: ReactNode;
	/** Classes for the card, which holds the title and the form. */
	className?: string;
};

/** The frame of a page that is one form outside the app shell, such as sign-up and login
 * (F01 section 6): a top bar with the name, linking home, then the title and the form in one
 * framed card. */
export function FormPage({
	title,
	intro,
	children,
	className,
}: Readonly<FormPageProps>) {
	return (
		<div className="bg-page flex min-h-dvh flex-col">
			<header className="flex min-h-16 items-center px-4 md:px-8">
				<Link
					href="/"
					className="text-heading text-ink font-bold tracking-tight"
				>
					Daybook
				</Link>
			</header>
			<main className="flex flex-1 items-start justify-center px-4 pt-2 pb-16 md:px-8 md:pt-14">
				<div
					className={cn(
						"rounded-section border-line bg-section flex w-full max-w-105 flex-col gap-5 border p-5 sm:p-8",
						className,
					)}
				>
					<div className="flex flex-col gap-1.5">
						<h1 className="text-title text-ink font-bold tracking-tight">
							{title}
						</h1>
						{intro && <p className="text-body text-ink-2">{intro}</p>}
					</div>
					{children}
				</div>
			</main>
		</div>
	);
}
