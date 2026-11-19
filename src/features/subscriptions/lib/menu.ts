import { pauseLimit } from "@/lib/subscriptions/rules";
import { type Formats, shortDate } from "./labels";
import type { SubscriptionItem } from "./types";

/** What a row's menu item does (BR-F05-22). */
export type MenuAction =
	| "resume"
	| "edit"
	| "skip"
	| "pause"
	| "resumeNow"
	| "changePause"
	| "cancel"
	| "changeEnd"
	| "keepGoing"
	| "viewCharges"
	| "delete";

export type MenuItem = {
	action: MenuAction;
	label: string;
	/** Delete is in the danger style. */
	danger?: true;
	/** Delete sits after a separator. */
	separatorBefore?: true;
};

/**
 * The items of a row's "Actions for Netflix" menu, in order and as the status allows
 * (BR-F05-22): Resume (ended); Edit; "Skip the 5 Nov charge" and Pause (active or ending, with a
 * next due date, Pause only while that date is before the 24-month limit, BR-F05-43); Resume
 * now and Change pause (paused); Cancel Subscription (active or paused); Change end date and
 * Keep it going (ending); View charges; and Delete after a separator. An upcoming Subscription
 * has Delete instead of Cancel (BR-F05-12), and an ended one is read-only but for Resume, Edit,
 * View charges and Delete.
 */
export function rowMenu(
	item: Pick<SubscriptionItem, "status" | "nextDueOn">,
	f: Formats,
): MenuItem[] {
	const { status, nextDueOn } = item;
	const items: MenuItem[] = [];
	if (status === "ended") items.push({ action: "resume", label: "Resume" });
	items.push({ action: "edit", label: "Edit" });
	if ((status === "active" || status === "ending") && nextDueOn !== null) {
		items.push({
			action: "skip",
			label: `Skip the ${shortDate(nextDueOn, f)} charge`,
		});
		if (nextDueOn < pauseLimit(f.today)) {
			items.push({ action: "pause", label: "Pause" });
		}
	}
	if (status === "paused") {
		items.push(
			{ action: "resumeNow", label: "Resume now" },
			{ action: "changePause", label: "Change pause" },
		);
	}
	if (status === "active" || status === "paused") {
		items.push({ action: "cancel", label: "Cancel Subscription" });
	}
	if (status === "ending") {
		items.push(
			{ action: "changeEnd", label: "Change end date" },
			{ action: "keepGoing", label: "Keep it going" },
		);
	}
	items.push(
		{ action: "viewCharges", label: "View charges" },
		{ action: "delete", label: "Delete", danger: true, separatorBefore: true },
	);
	return items;
}
