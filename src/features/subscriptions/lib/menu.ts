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

/** Whether Pause is offered (BR-F05-22, BR-F05-40, BR-F05-43): an active or ending Subscription
 * with a next due date that is before the 24-month limit, since a pause starts on that date and
 * must end after it, within 24 months of today. */
export function canPause(
	item: Pick<SubscriptionItem, "status" | "nextDueOn">,
	today: string,
): boolean {
	return (
		(item.status === "active" || item.status === "ending")
		&& item.nextDueOn !== null
		&& item.nextDueOn < pauseLimit(today)
	);
}

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
		if (canPause(item, f.today)) {
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

/** The keys that act on a selected Subscription as its menu's items do (BR-F05-45, D-630),
 * besides E for Edit. */
export type ShortcutKey = "S" | "P" | "R" | "C" | "Delete";

/** Each key, the menu items it acts as, and the words its hint uses for each. */
const KEYED: readonly {
	key: ShortcutKey;
	actions: Partial<Record<MenuAction, string>>;
}[] = [
	{ key: "S", actions: { skip: "skip" } },
	{ key: "P", actions: { pause: "pause", changePause: "change pause" } },
	{
		key: "R",
		actions: {
			resume: "resume",
			resumeNow: "resume now",
			keepGoing: "keep going",
		},
	},
	{ key: "C", actions: { cancel: "cancel", changeEnd: "change end" } },
	{ key: "Delete", actions: { delete: "delete" } },
];

/** The menu item a key acts as for `item`, or `null` when its menu offers none: S skips the next
 * charge, P pauses or changes the pause, R resumes (Resume now when paused, Keep it going when
 * ending), C cancels (Change end date when ending) and Delete deletes. A key acts only where
 * the menu offers the item, so it never does what the buttons would not (D-630). */
export function shortcutAction(
	key: ShortcutKey,
	item: Pick<SubscriptionItem, "status" | "nextDueOn">,
	f: Formats,
): MenuAction | null {
	const offered = rowMenu(item, f).map((entry) => entry.action);
	const keyed = KEYED.find((each) => each.key === key);
	return offered.find((action) => keyed && action in keyed.actions) ?? null;
}

/** The hints of the keys that act on `item`, in the order S, P, R, C, Delete: "S to skip",
 * "P to pause", "Delete to delete" (BR-F05-40, D-630). */
export function shortcutHints(
	item: Pick<SubscriptionItem, "status" | "nextDueOn">,
	f: Formats,
): string[] {
	return KEYED.flatMap(({ key, actions }) => {
		const action = shortcutAction(key, item, f);
		const words = action === null ? undefined : actions[action];
		return words === undefined ? [] : [`${key} to ${words}`];
	});
}
