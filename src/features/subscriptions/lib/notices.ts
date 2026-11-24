import { tz } from "@date-fns/tz";
import { addDays, startOfDay } from "date-fns";

import { formatDateYear } from "@/lib/date-format";
import { type Cadence, type Pause, sameCadence } from "@/lib/subscriptions/schedule";
import type {
	SubscriptionCreateInput,
	SubscriptionEditInput,
} from "@/lib/subscriptions/schemas";
import { type ChangeRequest, type ConflictFields, fieldsOf } from "./conflict";
import { dayWithWeekday, type Formats, shortDate } from "./labels";
import type {
	SubscriptionAnswer,
	SubscriptionChanged,
	SubscriptionCreated,
	SubscriptionDeleted,
	SubscriptionItem,
} from "./types";

/** Every write that has a notice (BR-F05-33). `resumeNow` is the panel's and menu's "Resume
 * now" on a paused Subscription, `resume` the dialog on an ended or ending one. */
export type WriteKind =
	| "add"
	| "edit"
	| "cancel"
	| "resume"
	| "pause"
	| "resumeNow"
	| "skip"
	| "unskip"
	| "delete";

/** A confirmed write, as the page learns of it: what the Subscription was before (what Undo puts
 * back), what the server answered, and what was sent. */
export type Confirmed =
	| { kind: "add"; saved: SubscriptionCreated; sent: SubscriptionCreateInput }
	| {
			kind: "edit" | "cancel" | "resume" | "pause" | "resumeNow";
			before: SubscriptionItem;
			saved: SubscriptionChanged;
			sent: SubscriptionEditInput;
	  }
	| {
			kind: "skip" | "unskip";
			before: SubscriptionItem;
			saved: SubscriptionAnswer;
			dueOn: string;
	  }
	/** `saved` is `null` when the Subscription was gone already (a 404 on a plain delete). */
	| {
			kind: "delete";
			before: SubscriptionItem;
			saved: SubscriptionDeleted | null;
	  };

/** What Undo sends (BR-F05-34): the request, at the version the write returned. `origin` is
 * what the conflict view shows as the user's version when the request deletes. */
export type UndoPlan = {
	request: ChangeRequest;
	version: number;
	origin: ConflictFields | null;
};

/** A notice for the page to show (BR-F05-33). */
export type WriteNotice = {
	subscriptionId: string;
	text: string;
	/** `null` after a delete (D-590) and for a failure. */
	undo: UndoPlan | null;
	/** Whether the panel may carry it when its Subscription is selected: not after a delete. */
	inPanel: boolean;
};

/** The confirmed writes that sent a change: Edit, Cancel, Resume, Pause and Resume now. */
type ConfirmedChange = Extract<Confirmed, { sent: SubscriptionEditInput }>;

const isChange = (c: Confirmed): c is ConfirmedChange =>
	c.kind !== "add"
	&& c.kind !== "delete"
	&& c.kind !== "skip"
	&& c.kind !== "unskip";

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

/** " Next charge Thu 5 Nov.", or nothing when there is none (BR-F05-33). */
const nextCharge = (item: Pick<SubscriptionItem, "nextDueOn">, f: Formats) =>
	item.nextDueOn === null ?
		""
	:	` Next charge ${dayWithWeekday(item.nextDueOn, f)}.`;

const samePause = (a: Pause | null, b: Pause | null) =>
	a === b
	|| (a !== null && b !== null && a.from === b.from && a.until === b.until);

/** The pause an Undo puts back: the one before the write while it still has dates to come
 * (a started one keeps its `from`, BR-F05-29), and none when it was over or never was, since
 * an over pause cannot be set again and its dates stay uncharged either way (BR-F05-29). */
function restoredPause(before: Pause | null, today: string): Pause | null {
	return before !== null && before.until > today ? before : null;
}

type UndoChange = Extract<ChangeRequest, { kind: "change" }>["body"];

/**
 * What Undo sends after a change (BR-F05-34): the previous value of each field the write
 * changed, `unskipDueOn` when it skipped a date that was not skipped before, `alsoPastCharges`
 * when it renamed past charges, and `backfillGap` with a Cancel's end date, so the charges it
 * deleted come back. `null` when the write changed no value, so there is nothing to put back.
 */
export function undoBody(
	{
		before,
		saved,
		sent,
		kind,
	}: {
		before: SubscriptionItem;
		saved: Pick<SubscriptionAnswer, "currency">;
		sent: SubscriptionEditInput;
		kind: WriteKind;
	},
	today: string,
): UndoChange | null {
	const body: UndoChange = {};
	revertValues(body, sent, before, saved);
	revertSchedule(body, sent, before, kind, today);
	if (Object.keys(body).length === 0) return null;
	if (sent.skipDueOn !== undefined && !before.skips.includes(sent.skipDueOn)) {
		body.unskipDueOn = sent.skipDueOn;
	}
	if (
		sent.alsoPastCharges === true
		&& (body.name !== undefined || body.category !== undefined)
	) {
		body.alsoPastCharges = true;
	}
	return body;
}

/** What Undo sends back for the text, amount, cadence, start date, category and note fields
 * a write changed. */
function revertValues(
	body: UndoChange,
	sent: SubscriptionEditInput,
	before: SubscriptionItem,
	saved: Pick<SubscriptionAnswer, "currency">,
) {
	if (sent.name !== undefined && sent.name !== before.name) {
		body.name = before.name;
	}
	if (sent.amountMinor !== undefined && sent.amountMinor !== before.amountMinor) {
		body.amountMinor = before.amountMinor;
		body.currency = saved.currency;
	}
	if (
		sent.cadence !== undefined
		&& !sameCadence(sent.cadence as Cadence, before.cadence)
	) {
		body.cadence = before.cadence;
	}
	if (sent.startDate !== undefined && sent.startDate !== before.startDate) {
		body.startDate = before.startDate;
	}
	if (sent.category !== undefined && sent.category !== before.category) {
		body.category = before.category;
	}
	if (sent.note !== undefined && sent.note !== before.note) {
		body.note = before.note;
	}
}

/** What Undo sends back for the end date and the pause a write changed. */
function revertSchedule(
	body: UndoChange,
	sent: SubscriptionEditInput,
	before: SubscriptionItem,
	kind: WriteKind,
	today: string,
) {
	if (sent.endDate !== undefined && sent.endDate !== before.endDate) {
		body.endDate = before.endDate;
		if (kind === "cancel") body.backfillGap = true;
	}
	if (sent.pause !== undefined && !samePause(sent.pause, before.pause)) {
		body.pause = restoredPause(before.pause, today);
	}
}

/** "Netflix cancelled. 1 charge deleted.", "Netflix cancelled. Earlier charges stay." or, for
 * an end date still to come, "Netflix ends on 31 Dec 2026." (BR-F05-33). */
function cancelText(saved: SubscriptionChanged, f: Formats): string {
	if (saved.endDate !== null && saved.endDate > f.today) {
		return `${saved.name} ends on ${formatDateYear(saved.endDate, f)}.`;
	}
	return saved.chargesDeleted > 0 ?
			`${saved.name} cancelled. ${plural(saved.chargesDeleted, "charge", "charges")} deleted.`
		:	`${saved.name} cancelled. Earlier charges stay.`;
}

/**
 * The notice for a confirmed write, in BR-F05-33's words, with what Undo sends (BR-F05-34).
 * An Add is undone by `DELETE` with `undo: "create"` at the version the create returned, a skip
 * by an Undo skip and an Undo skip by a skip, any change by a `PATCH` of the previous values; a
 * delete has no Undo (D-590) and never shows in the panel.
 */
export function confirmedNotice(c: Confirmed, f: Formats): WriteNotice {
	if (c.kind === "add") {
		const { saved } = c;
		const past =
			c.sent.backfill === true && saved.chargesCreated > 0 ?
				` with ${plural(saved.chargesCreated, "past charge", "past charges")}`
			:	"";
		return {
			subscriptionId: saved.id,
			text: `${saved.name} added${past}.${nextCharge(saved, f)}`,
			undo: {
				request: { kind: "delete", id: saved.id, body: { undo: "create" } },
				version: saved.version,
				origin: fieldsOf(saved),
			},
			inPanel: true,
		};
	}
	if (c.kind === "delete") {
		const kept = c.saved === null ? c.before.chargeCount : c.saved.chargesKept;
		return {
			subscriptionId: c.before.id,
			text:
				kept > 0 ?
					`${c.before.name} deleted. Its charges stay in Transactions.`
				:	`${c.before.name} deleted.`,
			undo: null,
			inPanel: false,
		};
	}
	if (!isChange(c)) {
		const { saved, before, dueOn } = c;
		const skipped = c.kind === "skip";
		const day = shortDate(dueOn, f);
		return {
			subscriptionId: saved.id,
			text:
				skipped ?
					`Skipped the ${day} ${saved.name} charge.`
				:	`The ${day} ${saved.name} charge is back.`,
			undo: {
				request:
					skipped ?
						{ kind: "unskip", id: saved.id, dueOn, body: {} }
					:	{ kind: "skip", id: saved.id, body: { dueOn } },
				version: saved.version,
				origin: fieldsOf(before),
			},
			inPanel: true,
		};
	}
	const { saved } = c;
	const body = undoBody(c, f.today);
	const text = (() => {
		switch (c.kind) {
			case "edit":
				return `${saved.name} saved.${nextCharge(saved, f)}`;
			case "cancel":
				return cancelText(saved, f);
			case "resume": {
				const added =
					saved.chargesCreated > 0 ?
						` ${plural(saved.chargesCreated, "missed charge", "missed charges")} added.`
					:	"";
				return `${saved.name} resumed.${added}${nextCharge(saved, f)}`;
			}
			case "pause":
				return saved.pause === null ?
						`${saved.name} paused.`
					:	`${saved.name} paused. Charges resume on ${formatDateYear(saved.pause.until, f)}.`;
			case "resumeNow":
				return `${saved.name} resumed.${nextCharge(saved, f)}`;
		}
	})();
	return {
		subscriptionId: saved.id,
		text,
		undo:
			body === null ? null : (
				{
					request: { kind: "change", id: saved.id, body },
					version: saved.version,
					origin: null,
				}
			),
		inPanel: true,
	};
}

/** Milliseconds from `now` to the next midnight in `timezone`, when the notice ends so an Undo
 * keeps the change date of its write (BR-F05-33, D-597). */
export function msUntilMidnight(now: Date, timezone: string): number {
	const zone = tz(timezone);
	const next = startOfDay(addDays(now, 1, { in: zone }), { in: zone });
	return next.getTime() - now.getTime();
}
