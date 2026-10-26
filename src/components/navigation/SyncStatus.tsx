import {
	CircleAlert,
	Clock3,
	Check,
	Loader,
	Pause,
	type LucideIcon,
} from "lucide-react";
import { Button as AriaButton } from "react-aria-components";

import { Tooltip } from "@/components/navigation/Tooltip";
import { cn } from "@/lib/cn";

export type SyncState = "saved" | "saving" | "waiting" | "attention" | "paused";

export type SyncStatusProps = {
	/** Attention outranks Paused, which outranks the rest (P1, BR-P1-24). The caller picks. */
	state?: SyncState;
	/** Every item not yet confirmed: pending plus rejected. */
	count?: number;
	/** Why saving is paused: the user must log in, or the app must be updated. */
	pausedReason?: "login" | "update";
	/** Opens the sync panel. */
	onOpen?: () => void;
	className?: string;
};

const looks: Record<SyncState, { icon: LucideIcon; tone: string }> = {
	saved: { icon: Check, tone: "border-line-strong bg-page text-pos" },
	saving: { icon: Loader, tone: "border-line-strong bg-soft text-ink" },
	waiting: {
		icon: Clock3,
		tone: "border-[1.5px] border-dashed border-edge bg-transparent text-ink-2",
	},
	attention: { icon: CircleAlert, tone: "border-ink bg-ink text-page" },
	paused: { icon: Pause, tone: "border-line-strong bg-page text-ink" },
};

function changes(count: number) {
	return count === 1 ? "1 change" : `${count} changes`;
}

/** The short text on the button and the full sentence for the tooltip and screen readers. */
function wording(
	state: SyncState,
	count: number,
	pausedReason: "login" | "update",
): { short: string; full: string } {
	switch (state) {
		case "saved":
			return { short: "", full: "All changes saved" };
		case "saving":
			return { short: `Saving ${count}`, full: `Saving ${changes(count)}…` };
		case "waiting":
			return {
				short: `${count} waiting`,
				full: `${changes(count)} waiting to sync`,
			};
		case "attention":
			return {
				short: count === 1 ? "1 needs attention" : `${count} need attention`,
				full: `${changes(count)} ${count === 1 ? "needs" : "need"} attention`,
			};
		case "paused":
			return {
				short: "Paused",
				full:
					pausedReason === "update" ?
						"Update to keep saving."
					:	"Saving paused. Log in to continue.",
			};
	}
}

/**
 * The header's sync indicator (P1, BR-P1-24): an icon alone when everything is saved, a short
 * text with a count otherwise. Selecting it opens the sync panel. A change of state is read out
 * politely.
 */
export function SyncStatus({
	state = "saved",
	count = 0,
	pausedReason = "login",
	onOpen,
	className,
}: SyncStatusProps) {
	const { icon: Icon, tone } = looks[state];
	const { short, full } = wording(state, count, pausedReason);
	return (
		<>
			<Tooltip text={full}>
				<AriaButton
					{...(onOpen ? { onPress: onOpen } : {})}
					aria-label={full}
					className={cn(
						"text-caption inline-flex h-8.5 min-w-8.5 cursor-pointer items-center justify-center gap-1.75 rounded-full border font-semibold whitespace-nowrap max-md:h-11 max-md:min-w-11",
						short ? "px-3" : "px-0",
						tone,
						className,
					)}
				>
					<Icon
						aria-hidden="true"
						className={cn(
							"size-3.75",
							state === "saving"
								&& "animate-spin motion-reduce:animate-none",
						)}
					/>
					{short}
				</AriaButton>
			</Tooltip>
			<span
				role="status"
				className="sr-only"
			>
				{full}
			</span>
		</>
	);
}
