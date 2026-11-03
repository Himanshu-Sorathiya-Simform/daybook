"use client";

import type { ReactNode } from "react";
import {
	Link as AriaLink,
	type LinkProps as AriaLinkProps,
} from "react-aria-components";

import { buttonClasses, type ButtonProps } from "@/components/actions/Button";
import { cn } from "@/lib/cn";

export type ButtonLinkProps = Omit<
	AriaLinkProps,
	"className" | "style" | "children"
> & {
	/** Where it goes, inside Daybook or out. */
	href: string;
	variant?: ButtonProps["variant"];
	size?: ButtonProps["size"];
	children: ReactNode;
	className?: string;
};

/** A link that looks like a `Button`, for a navigation that is the main action, such as Log in
 * and Sign up on the landing page. It is still a link: it opens a page and can be opened in a
 * new tab. */
export function ButtonLink({
	variant = "primary",
	size = "md",
	children,
	className,
	...rest
}: Readonly<ButtonLinkProps>) {
	return (
		<AriaLink
			{...rest}
			className={cn(
				buttonClasses({ variant, size }),
				"justify-center",
				className,
			)}
		>
			{children}
		</AriaLink>
	);
}
