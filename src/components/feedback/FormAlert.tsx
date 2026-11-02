import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type FormAlertProps = { children: ReactNode; className?: string };

/** A refusal of a whole form, above its button, read out at once: "Email or password is
 * incorrect.", "We couldn't save your setup. Try again." A refusal of one field shows under
 * that field instead. */
export function FormAlert({ children, className }: Readonly<FormAlertProps>) {
	return (
		<p
			role="alert"
			className={cn("text-label text-neg", className)}
		>
			{children}
		</p>
	);
}
