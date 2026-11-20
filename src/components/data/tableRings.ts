/** A focus ring inside its own box, rounded, so a table's scroll box never clips it. The base
 * style's ring outside the box is turned off. Shared by the tables of Budgets and
 * Subscriptions. */
export const RING_INSIDE =
	"outline-none focus-visible:rounded-control focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-focus";

/** A focused row's ring, drawn on its cells: top and bottom on each, and the ends on the first
 * and last, which round the row's corners. */
export const ROW_RING = [
	"group-focus-visible:shadow-[inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
	"group-focus-visible:first:shadow-[inset_2px_0_var(--color-focus),inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
	"group-focus-visible:last:shadow-[inset_-2px_0_var(--color-focus),inset_0_2px_var(--color-focus),inset_0_-2px_var(--color-focus)]",
];
