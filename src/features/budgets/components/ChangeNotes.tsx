import type { BudgetChange, PreviewNote } from "@/lib/budgets/preview";
import { cn } from "@/lib/cn";
import { noteText, type PreviewContext } from "../lib/preview";

export type ChangeNotesProps = {
	notes: readonly PreviewNote[];
	change: BudgetChange;
	context: PreviewContext;
	className?: string;
};

/** The notes under "What changes" (BR-F04-27), in the spec's order: warnings in a soft box,
 * never errors. Nothing shows when there are none. */
export function ChangeNotes({
	notes,
	change,
	context,
	className,
}: Readonly<ChangeNotesProps>) {
	if (notes.length === 0) return null;
	return (
		<ul
			className={cn(
				"bg-soft rounded-control text-body text-ink flex flex-col gap-0.5 px-3 py-2.5",
				className,
			)}
		>
			{notes.map((note) => (
				<li key={note.kind}>{noteText(note, change, context)}</li>
			))}
		</ul>
	);
}
