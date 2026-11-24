"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/actions/Button";
import { Badge } from "@/components/data/Badge";
import { Dialog } from "@/components/surfaces/Dialog";
import { cn } from "@/lib/cn";

/** One row of the conflict view: a field or a month, and what each version holds there. */
export type ConflictViewRow = {
	key: string;
	label: string;
	/** The two versions read differently: the row is tinted and marked. */
	differs: boolean;
	mine: ReactNode;
	theirs: ReactNode;
};

/** The words of a feature's conflict view. A delete swaps in its own intro, its own heading
 * for the user's column when it has one, and "Delete anyway" and "Keep it". */
export type ConflictViewText = {
	title: string;
	/** The line above the table. */
	intro: string;
	deleteIntro: string;
	mine: string;
	/** The heading of the user's column on a delete, when it differs from `mine`. */
	deletedMine?: string;
	theirs: string;
	/** The word that marks a row that differs, so colour is never the only sign. */
	differs: string;
	keepMine: string;
	keepTheirs: string;
	deleteAnyway: string;
	keepIt: string;
};

export type ConflictViewProps = {
	text: ConflictViewText;
	/** The heading of the first column: what a row is, a field or a month. */
	rowHeading: string;
	/** The view for a delete: its intro and "Delete anyway" and "Keep it". */
	isDelete?: boolean;
	isOpen: boolean;
	/** Closing without a choice. */
	onOpenChange: (isOpen: boolean) => void;
	rows: readonly ConflictViewRow[];
	onKeepMine: () => void;
	onKeepTheirs: () => void;
	/** What Keep mine saves, under the table. */
	keepMineLine?: string | undefined;
	/** While Keep mine's resend runs: both choices wait, and so does closing. */
	isPending?: boolean;
	/** The cells hold amounts: tabular figures. */
	figures?: boolean;
	/** The width of the first column, as a Tailwind width class. */
	rowColumnClassName?: string;
	className?: string;
};

/**
 * The conflict view that follows a 409 (BR-P2-21): the user's version beside the one saved now,
 * a row for each field or month, a row that differs tinted and marked with a word. Keep mine
 * resends the user's write against the saved version; Keep theirs drops it. The features word
 * the rows and the choices; this lays them out.
 */
export function ConflictView({
	text,
	rowHeading,
	isDelete = false,
	isOpen,
	onOpenChange,
	rows,
	onKeepMine,
	onKeepTheirs,
	keepMineLine,
	isPending = false,
	figures = false,
	rowColumnClassName = "w-[30%]",
	className,
}: Readonly<ConflictViewProps>) {
	const mineHeading = (isDelete && text.deletedMine) || text.mine;
	return (
		<Dialog
			title={text.title}
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
						{isDelete ? text.keepIt : text.keepTheirs}
					</Button>
					<Button
						isPending={isPending}
						onPress={onKeepMine}
					>
						{isDelete ? text.deleteAnyway : text.keepMine}
					</Button>
				</>
			}
			{...(className ? { className } : {})}
		>
			<p className="text-body text-ink-2">
				{isDelete ? text.deleteIntro : text.intro}
			</p>
			<table
				className={cn(
					"text-body w-full table-fixed border-collapse",
					figures && "figures",
				)}
			>
				<thead>
					<tr className="text-label text-ink-2 text-left">
						<th
							scope="col"
							className={cn("pb-1.5 font-normal", rowColumnClassName)}
						>
							{rowHeading}
						</th>
						<th
							scope="col"
							className="pb-1.5 font-normal"
						>
							{mineHeading}
						</th>
						<th
							scope="col"
							className="pb-1.5 font-normal"
						>
							{text.theirs}
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							key={row.key}
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
										<Badge tone="outline">{text.differs}</Badge>
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
