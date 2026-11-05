"use client";

import { Button } from "@/components/actions/Button";
import { Badge } from "@/components/data/Badge";
import { Dialog } from "@/components/surfaces/Dialog";
import { cn } from "@/lib/cn";
import { CONFLICT_TEXT, type ConflictRow } from "../lib/conflict";

export type ConflictDialogProps = {
	isOpen: boolean;
	/** Closing without a choice goes back to the edit dialog, which keeps what was typed. */
	onOpenChange: (isOpen: boolean) => void;
	/** Every field of both versions, from `conflictRows`. */
	rows: readonly ConflictRow[];
	/** What Keep mine saves, from `keepMineLine`; a delete's view has none. */
	keepMineLine?: string;
	/** The view for a delete (BR-P1-26): the row as it was deleted beside the saved one, with
	 * "Delete anyway" and "Keep it". */
	isDelete?: boolean;
	onKeepMine: () => void;
	onKeepTheirs: () => void;
	/** While Keep mine's resend runs: both choices wait, and so does closing. */
	isPending?: boolean;
	className?: string;
};

/**
 * The conflict view (BR-F03-24, BR-P1-26, BR-F03-78): after a 409, the user's version beside
 * the one saved now, field by field, each difference marked with "Differs" as well as a tint, so
 * colour is never the only sign. Keep mine resends the user's change against the saved version;
 * Keep theirs drops it. For a delete, the row as it was deleted sits beside the saved one, and
 * the choices read "Delete anyway" and "Keep it" (BR-F03-26).
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
			onOpenChange={(next) => {
				if (!isPending) onOpenChange(next);
			}}
			isKeyboardDismissDisabled={isPending}
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
			<table className="text-body w-full table-fixed border-collapse">
				<thead>
					<tr className="text-label text-ink-2 text-left">
						<th
							scope="col"
							className="w-[30%] pb-1.5 font-normal"
						>
							{CONFLICT_TEXT.field}
						</th>
						<th
							scope="col"
							className="pb-1.5 font-normal"
						>
							{isDelete ?
								CONFLICT_TEXT.deletedMine
							:	CONFLICT_TEXT.mine}
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
							key={row.field}
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
								{row.mine}
							</td>
							<td className="text-ink py-2.5 pr-1.5 break-words whitespace-pre-line">
								{row.theirs}
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
