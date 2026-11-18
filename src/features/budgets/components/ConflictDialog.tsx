"use client";

import { Button } from "@/components/actions/Button";
import { Badge } from "@/components/data/Badge";
import { Dialog } from "@/components/surfaces/Dialog";
import { cn } from "@/lib/cn";
import { CONFLICT_TEXT, type ConflictRow } from "../lib/conflict";

export type ConflictDialogProps = {
	isOpen: boolean;
	/** Closing without a choice goes back to where the write started. */
	onOpenChange: (isOpen: boolean) => void;
	/** Every month either version holds an item in, from `conflictRows`. */
	rows: readonly ConflictRow[];
	/** What Keep mine saves, from `keepMineLine` or `CONFLICT_TEXT.undoLine`; a delete's view
	 * has none. */
	keepMineLine?: string | undefined;
	/** The view for a delete: "Delete anyway" and "Keep it". */
	isDelete?: boolean;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
	/** While Keep mine's resend runs: both choices wait, and so does closing. */
	isPending?: boolean;
	className?: string;
};

/**
 * The Budget conflict view (BR-F04-23, D-567): after a 409 from a save, a delete, Remove or
 * Undo, the user's version beside the one saved now, a row per month that holds a schedule
 * entry or a one-month limit, each cell worded as the limit history words it. A row that reads
 * differently is tinted and marked "Differs", so colour is never the only sign. Keep mine
 * resends the write against the saved version, Keep theirs sends nothing. For a delete the
 * choices read "Delete anyway" and "Keep it".
 */
export function ConflictDialog({
	isOpen,
	onOpenChange,
	rows,
	keepMineLine,
	isDelete = false,
	onKeepMine,
	onKeepTheirs,
	isPending = false,
	className,
}: Readonly<ConflictDialogProps>) {
	return (
		<Dialog
			title={CONFLICT_TEXT.title}
			size="lg"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isPending={isPending}
			footer={
				<>
					<span className="flex-1" />
					<Button
						variant="secondary"
						isDisabled={isPending}
						onPress={onKeepTheirs}
					>
						{isDelete ? CONFLICT_TEXT.keepIt : CONFLICT_TEXT.keepTheirs}
					</Button>
					<Button
						isPending={isPending}
						onPress={onKeepMine}
					>
						{isDelete ?
							CONFLICT_TEXT.deleteAnyway
						:	CONFLICT_TEXT.keepMine}
					</Button>
				</>
			}
			{...(className ? { className } : {})}
		>
			<p className="text-body text-ink-2">
				{isDelete ? CONFLICT_TEXT.deleteIntro : CONFLICT_TEXT.intro}
			</p>
			<table className="text-body figures w-full table-fixed border-collapse">
				<thead>
					<tr className="text-label text-ink-2 text-left">
						<th
							scope="col"
							className="w-[26%] pb-1.5 font-normal"
						>
							{CONFLICT_TEXT.month}
						</th>
						<th
							scope="col"
							className="pb-1.5 font-normal"
						>
							{CONFLICT_TEXT.mine}
						</th>
						<th
							scope="col"
							className="pb-1.5 font-normal"
						>
							{CONFLICT_TEXT.theirs}
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							key={row.month}
							data-differs={row.differs || undefined}
							className={cn(
								"border-line border-t align-top",
								row.differs && "bg-accent-soft",
							)}
						>
							<th
								scope="row"
								className="text-ink-2 py-2.5 pr-2 pl-1.5 text-left font-normal"
							>
								<span className="flex flex-wrap items-center gap-1.5">
									{row.label}
									{row.differs && (
										<Badge tone="outline">
											{CONFLICT_TEXT.differs}
										</Badge>
									)}
								</span>
							</th>
							<td className="text-ink py-2.5 pr-2 break-words whitespace-pre-line">
								{row.mine.join("\n")}
							</td>
							<td className="text-ink py-2.5 pr-1.5 break-words whitespace-pre-line">
								{row.theirs.join("\n")}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{keepMineLine && (
				<p className="text-caption text-ink-2">{keepMineLine}</p>
			)}
		</Dialog>
	);
}
