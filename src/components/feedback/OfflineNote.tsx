import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type OfflineNoteProps = { children: ReactNode; className?: string };

/** The line above a form that needs a connection, while there is none: "You are offline.
 * Connect to log in." It is announced politely; the form under it is disabled. */
export function OfflineNote({ children, className }: Readonly<OfflineNoteProps>) {
	return (
		<p
			role="status"
			className={cn("text-label text-ink-2", className)}
		>
			{children}
		</p>
	);
}
