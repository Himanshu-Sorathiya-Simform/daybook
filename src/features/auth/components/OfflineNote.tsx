import { AUTH_MESSAGES } from "../lib/messages";

export type OfflineNoteProps = { online: boolean };

/** The offline line; the form under it is disabled (F01 section 6). */
export function OfflineNote({ online }: Readonly<OfflineNoteProps>) {
	if (online) return null;
	return (
		<p
			role="status"
			className="text-label text-ink-2"
		>
			{AUTH_MESSAGES.offline}
		</p>
	);
}
