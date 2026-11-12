import { createContext, useContext, useEffect } from "react";

/** The shell's Add slot (D-548): its header button, its bottom-bar button and nothing else call
 * what a feature registers here, so the shell never imports the feature that adds. */
export type AddSlot = {
	/** Makes `open` what Add does, and answers the call that takes it back. */
	register: (open: () => void) => () => void;
};

export const AddSlotContext = createContext<AddSlot | null>(null);

/** Fills the shell's Add slot with `open` while the caller is mounted. Outside a shell it does
 * nothing. */
export function useAddSlot(open: () => void): void {
	const slot = useContext(AddSlotContext);
	useEffect(() => slot?.register(open), [slot, open]);
}
