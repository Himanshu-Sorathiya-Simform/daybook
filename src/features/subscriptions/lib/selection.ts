import type {
	Key as AriaKey,
	Selection as AriaSelection,
} from "react-aria-components";

/** The id a selection change chose, or `null` for a cleared one. Single selection never
 * reports "all". */
export const pickedId = (keys: AriaSelection): string | null => {
	const [key] = keys as Set<AriaKey>;
	return key === undefined ? null : String(key);
};

/** The selected keys of a list or table whose rows are `ids`: the selected id when this
 * collection holds it, else none. */
export const selectedIn = (
	ids: readonly string[],
	selected: string | null,
): string[] => (selected !== null && ids.includes(selected) ? [selected] : []);
