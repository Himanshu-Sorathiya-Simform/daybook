"use client";

import { Pause } from "lucide-react";
import { GridListItem as AriaGridListItem } from "react-aria-components";

import { Badge } from "@/components/data/Badge";
import { CategoryTag } from "@/components/data/CategoryTag";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";
import {
	amountWithCadence,
	cadenceWords,
	chargesCaption,
	type Formats,
	money,
	monthlyHint,
	phoneDateLine,
	rowBadges,
	rowDate,
} from "../lib/labels";
import type { ListRow } from "../lib/groups";
import { type MenuAction, readyMenu } from "../lib/menu";
import { RowMenu } from "./RowMenu";

export type SubscriptionRowProps = {
	row: ListRow;
	formats: Formats;
	onAction: (action: MenuAction, id: string) => void;
	className?: string;
};

/**
 * One Subscription in the list (BR-F05-22): from 768 px its next due date over how far off it
 * is, then the name with the category, the badges and the 30-day caption, then the amount with
 * its cadence and the monthly equivalent, then the actions menu. Below 768 px the date sits
 * under the amount instead and the category under the name. An ended row is dimmed.
 *
 * The two layouts are CSS, not a width read in script: the server cannot know the window, so a
 * script-chosen layout would be drawn narrow and then redrawn wide once the page loads, moving
 * everything (D-625). Both layouts' pieces are in the row and a breakpoint shows the right ones.
 * React Aria names the row by its text value, which holds the whole reading, the name first.
 */
export function SubscriptionRow({
	row,
	formats,
	onAction,
	className,
}: Readonly<SubscriptionRowProps>) {
	const { item } = row;
	const date = rowDate(item, formats);
	const badges = rowBadges(item, formats);
	const caption = chargesCaption(row.upcomingCount, row.upcomingMinor, formats);
	const hint = monthlyHint(item, formats);
	const phoneLine = phoneDateLine(item, formats);
	const ended = item.status === "ended";
	const menu = readyMenu(item, formats);
	return (
		<AriaGridListItem
			id={item.id}
			textValue={[
				item.name,
				categoryLabel(item.category),
				amountWithCadence(item, formats),
				`${date.top} ${date.sub}`.trim(),
			]
				.filter(Boolean)
				.join(", ")}
			className={cn(
				"rounded-control focus-visible:focus-ring hover:bg-soft selected:bg-accent-soft -mx-3 grid min-h-14 cursor-pointer items-center gap-2.5 px-3 py-2 outline-none",
				"grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[8rem_minmax(0,1fr)_11.25rem_2.5rem] md:gap-3.5",
				"transition-colors duration-(--dur-fast) ease-out",
				className,
			)}
		>
			<span className="figures flex flex-col max-md:hidden">
				<span
					className={cn("text-body font-semibold", ended && "text-ink-2")}
				>
					{date.top}
				</span>
				<span className="text-caption text-ink-3">{date.sub}</span>
			</span>
			<span className="flex min-w-0 flex-col gap-0.75">
				<span className="flex flex-wrap items-center gap-2">
					<span className="text-body font-semibold">{item.name}</span>
					<CategoryTag
						category={item.category}
						variant="dot"
						className="max-md:order-last max-md:basis-full"
					/>
					{badges.map((badge) => (
						<Badge
							key={badge.kind}
							tone="outline"
							{...(badge.kind === "paused" ? { icon: Pause } : {})}
						>
							{badge.text}
						</Badge>
					))}
				</span>
				{caption !== null && (
					<span className="text-caption text-ink-3">{caption}</span>
				)}
			</span>
			<span className="figures flex flex-col items-end text-right">
				<span>
					<span
						className={cn(
							"text-body font-semibold",
							ended && "text-ink-2",
						)}
					>
						{money(item.amountMinor, formats)}
					</span>{" "}
					<span className="text-caption text-ink-2">
						{cadenceWords(item.cadence)}
					</span>
				</span>
				{hint !== null && (
					<span className="text-caption text-ink-3 max-md:hidden">
						{hint}
					</span>
				)}
				{phoneLine !== "" && (
					<span className="text-caption text-ink-3 md:hidden">
						{phoneLine}
					</span>
				)}
			</span>
			<span className="flex justify-end max-md:hidden">
				{menu.length > 0 && (
					<RowMenu
						name={item.name}
						items={menu}
						onAction={(action) => onAction(action, item.id)}
					/>
				)}
			</span>
		</AriaGridListItem>
	);
}
