"use client";

import { CloudOff } from "lucide-react";
import type { ReactNode } from "react";

import { FormNote } from "@/components/feedback/FormNote";

export type OfflineNoteProps = { children: ReactNode; className?: string };

/** The note at the top of a form that needs a connection, while there is none: "You are
 * offline. Connect to log in." A `FormNote` with the offline icon; the form under it is
 * disabled. */
export function OfflineNote({ children, className }: Readonly<OfflineNoteProps>) {
	return (
		<FormNote
			icon={CloudOff}
			{...(className ? { className } : {})}
		>
			{children}
		</FormNote>
	);
}
