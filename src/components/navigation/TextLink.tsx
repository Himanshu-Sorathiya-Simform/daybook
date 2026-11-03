"use client";

import type { ReactNode } from "react";
import {
	Link as AriaLink,
	type LinkProps as AriaLinkProps,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type TextLinkProps = Omit<
	AriaLinkProps,
	"className" | "style" | "children"
> & {
	href: string;
	children: ReactNode;
	className?: string;
};

/** A link inside running text, such as "Already have an account? Log in". Underlined, so it is
 * told apart from the words around it by more than colour. */
export function TextLink({ children, className, ...rest }: Readonly<TextLinkProps>) {
	return (
		<AriaLink
			{...rest}
			className={cn(
				"text-accent cursor-pointer font-semibold underline underline-offset-2",
				"hover:decoration-2",
				className,
			)}
		>
			{children}
		</AriaLink>
	);
}
