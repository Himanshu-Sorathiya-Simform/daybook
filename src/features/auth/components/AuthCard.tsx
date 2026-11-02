import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type AuthCardProps = {
	title: string;
	children: ReactNode;
	className?: string;
};

/** The frame of the sign-up and login screens: the name, linking home, then one titled column. */
export function AuthCard({ title, children, className }: Readonly<AuthCardProps>) {
	return (
		<main className="bg-page flex min-h-dvh justify-center px-4 py-12 md:items-center">
			<div className={cn("flex w-full max-w-sm flex-col gap-6", className)}>
				<Link
					href="/"
					className="text-heading text-ink self-start"
				>
					Daybook
				</Link>
				<h1 className="text-title text-ink">{title}</h1>
				{children}
			</div>
		</main>
	);
}
