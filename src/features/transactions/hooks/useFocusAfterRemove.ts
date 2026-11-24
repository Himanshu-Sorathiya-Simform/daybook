import { type RefObject, useEffect, useState } from "react";

/** How many frames a focus move after a delete waits for the confirm to close. */
const FOCUS_FRAMES = 30;

/** The id of the row after `id` in the list as shown, else the one before: where focus goes
 * after a delete from the keyboard (BR-F03-73). `null` when `id` is not among the rows. */
export function neighbourOf(list: HTMLElement | null, id: string): string | null {
	const keys = [
		...(list?.querySelectorAll<HTMLElement>('[role="row"][data-key]') ?? []),
	]
		.map((row) => row.dataset["key"])
		.filter((key): key is string => key !== undefined);
	const at = keys.indexOf(id);
	if (at === -1) return null;
	return keys[at + 1] ?? keys[at - 1] ?? null;
}

/**
 * Moves focus to a row once a delete from the keyboard is confirmed (BR-F03-73): `focusRow`
 * names the row, and the move waits, a frame at a time, until the confirm has closed and given
 * its own focus back, then focuses the row in `area`.
 */
export function useFocusAfterRemove(area: RefObject<HTMLElement | null>) {
	const [focusAfter, setFocusAfter] = useState<{ id: string } | null>(null);
	useEffect(() => {
		if (focusAfter === null) return;
		let tries = FOCUS_FRAMES;
		let frame = 0;
		const move = () => {
			const target = area.current?.querySelector<HTMLElement>(
				`[role="row"][data-key="${CSS.escape(focusAfter.id)}"]`,
			);
			if (target && !document.querySelector('[role="alertdialog"]')) {
				target.focus();
			} else if (--tries > 0) frame = requestAnimationFrame(move);
		};
		move();
		return () => cancelAnimationFrame(frame);
	}, [focusAfter, area]);
	return { focusRow: (id: string) => setFocusAfter({ id }) };
}
