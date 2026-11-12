"use client";

import { CircleAlert } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

export type FormAlertProps = {
	children: ReactNode;
	/** Moves focus to the alert each time it shows a new message, as the login, sign-up and
	 * onboarding forms do (D-510), so it is the first thing a keyboard user reaches. */
	takesFocus?: boolean;
	className?: string;
};

/** A refusal of a whole form, in a box with its icon on the negative fill, read out at once:
 * "Email or password is incorrect.", "We couldn't save your setup. Try again." A refusal of one
 * field shows under that field instead. */
export function FormAlert({
	children,
	takesFocus = false,
	className,
}: Readonly<FormAlertProps>) {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (takesFocus) box.current?.focus();
	}, [takesFocus, children]);
	return (
		<div
			ref={box}
			role="alert"
			{...(takesFocus ? { tabIndex: -1 } : {})}
			className={cn(
				"rounded-control bg-neg-soft text-label text-ink flex items-start gap-2.5 px-3 py-2.5 font-medium outline-none",
				className,
			)}
		>
			<CircleAlert
				aria-hidden="true"
				className="text-neg mt-0.5 size-4 shrink-0"
			/>
			<span>{children}</span>
		</div>
	);
}
