import { TRANSACTION_MESSAGES } from "@/lib/transactions/schemas";

import type { WidgetSize } from "./widgets";

/** F08 section 8's messages, and the API-only ones a client sees only when it breaks a rule.
 * The ones that name a widget are functions below, so the page and its tests write the same
 * words. */
export const DASHBOARD_MESSAGES = {
	keepOne: "Keep at least one widget on your dashboard.",
	resetConfirm: "Reset your dashboard to the default layout?",
	resetDone: "Reset to the default layout.",
	copyNotice: "Overview is ours, so you are editing your own copy of it.",
	tooManyViews: "You can save up to 5 views of your own.",
	nameRequired: "Enter a name for this view.",
	nameTooLong: "Use 40 characters or fewer.",
	saveFailed: "Your dashboard layout couldn't be saved.",
	widgetFailed: "This could not be loaded.",
	noRenewals: "No upcoming renewals.",
	offlineMonth: "You're offline. This month isn't saved on this device.",
	monthNotice: "Some filters in this link weren't valid and were removed.",
	refundsExceeded: "Refunds exceeded spending",
	noIncomeYet: "No income yet",
	belowZero: "Below zero",
	noBudgets: "No Budgets",
	nothingRecorded: "Nothing recorded",
	selectDay: "Select a day to see its Transactions.",
	// API-only.
	month: "Use a month as YYYY-MM, from 2000-01 to this month.",
	id: TRANSACTION_MESSAGES.id,
	instant: TRANSACTION_MESSAGES.instant,
	boolean: "Send true or false.",
	formatVersion: "Send the layout format as a whole number.",
	views: "Send 1 to 10 views.",
	viewTwice: "Send each view once.",
	widgets: "Send the widgets as a list of at most 50.",
	widget: "Send each widget as an id, a whole size, and true or false for hidden.",
} as const;

/** What a size reads as: the fraction the design shows on the size buttons. */
export const SIZE_LABELS: Record<WidgetSize, string> = {
	2: "⅓",
	3: "½",
	4: "⅔",
	6: "Full",
};

/** The announcement of a move (BR-F08-25): the position and count are the view's visible
 * widgets'. */
export const movedMessage = (title: string, position: number, count: number) =>
	`${title} moved to position ${position} of ${count}.`;

export const sizedMessage = (title: string, size: WidgetSize) =>
	`${title} is now ${SIZE_LABELS[size]} width.`;

export const hiddenMessage = (title: string) => `${title} hidden.`;

export const addedMessage = (title: string) => `${title} added.`;

export const deleteViewTitle = (name: string) => `Delete “${name}”?`;
export const DELETE_VIEW_TEXT = "This view is removed on every device.";
