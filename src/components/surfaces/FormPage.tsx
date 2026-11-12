import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type FormPageProps = {
	title: string;
	/** A line under the title, such as onboarding's "Four quick choices." */
	intro?: string;
	children: ReactNode;
	/** `card` holds one narrow form in a framed card, as sign-up and login do; `wide` puts the
	 * title over a wide column with no frame, as onboarding does with its Preview beside the
	 * fields. */
	layout?: "card" | "wide";
	/** Whether the name in the top bar links home. Onboarding's does not: a user without a
	 * profile has nowhere else to go (BR-F02-01). */
	homeLink?: boolean;
	/** The top bar's right side, such as onboarding's email and Log out. */
	actions?: ReactNode;
	/** Classes for the column that holds the title and the form: the card, or the wide column. */
	className?: string;
};

/** The frame of a page that is one form outside the app shell, such as sign-up, login and
 * onboarding (F01 and F02 section 6): a top bar with the name, then the title and the form. */
export function FormPage({
	title,
	intro,
	children,
	layout = "card",
	homeLink = true,
	actions,
	className,
}: Readonly<FormPageProps>) {
	const name = "text-heading text-ink font-bold tracking-tight";
	return (
		<div className="bg-page flex min-h-dvh flex-col">
			<header className="flex min-h-16 items-center gap-2 px-4 md:px-8">
				{homeLink ?
					<Link
						href="/"
						className={name}
					>
						Daybook
					</Link>
				:	<span className={name}>Daybook</span>}
				{actions && (
					<div className="ml-auto flex min-w-0 items-center gap-2">
						{actions}
					</div>
				)}
			</header>
			<main className="flex flex-1 items-start justify-center px-4 pt-2 pb-16 md:px-8 md:pt-14">
				<div
					className={cn(
						"flex w-full flex-col",
						layout === "card" ?
							"rounded-section border-line bg-section max-w-105 gap-5 border p-5 sm:p-8"
						:	"max-w-240 gap-7",
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
