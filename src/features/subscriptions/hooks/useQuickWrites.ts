import { useOnce } from "@/hooks/useOnce";
import { useOnline } from "@/hooks/useOnline";
import { uuidV7 } from "@/lib/ids";
import { resumeNowPause } from "@/lib/subscriptions/rules";
import type { ChangeRequest } from "../lib/conflict";
import { DIALOG_TEXT } from "../lib/dialog";
import type { Confirmed, WriteKind } from "../lib/notices";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { useChangeSubscription } from "./useChangeSubscription";
import { useSkipCharge } from "./useSkipCharge";
import type { SubscriptionNotices } from "./useSubscriptionNotice";
import { useUnskipCharge } from "./useUnskipCharge";

/**
 * The writes that have no dialog (BR-F05-26, BR-F05-27, BR-F05-29): "Skip this one" and "Skip the
 * 5 Nov charge", Undo skip, and Resume now. Each sends one request with a new key per press, at
 * the version the page holds, and a second press while one is out sends nothing (D-615). A
 * confirmed write is the page's notice with Undo (BR-F05-33). Before M5 they are online only:
 * offline, a press says so in a notice. A refusal is a notice too, or for a 409 the conflict
 * view, with Keep mine sending the same write again against the saved version (BR-F05-34).
 */
export function useQuickWrites(
	locale: Pick<SubscriptionsLocale, "today">,
	notices: Pick<SubscriptionNotices, "confirm" | "fail" | "refused">,
) {
	const online = useOnline();
	const skip = useSkipCharge();
	const unskip = useUnskipCharge();
	const change = useChangeSubscription();
	const sending = useOnce();

	/** Sends `write` unless offline or one is already out, and says whether it was confirmed. */
	const send = async <Answer>(
		item: SubscriptionItem,
		kind: WriteKind,
		request: ChangeRequest,
		write: () => Promise<Answer>,
		confirmed: (answer: Answer) => Confirmed,
	): Promise<boolean> => {
		if (!online) {
			notices.fail(item.id, DIALOG_TEXT.offline);
			return false;
		}
		const sent = sending.run(write);
		if (sent === null) return false;
		try {
			notices.confirm(confirmed(await sent));
			return true;
		} catch (error) {
			await notices.refused(error, { kind, request, before: item });
			return false;
		}
	};

	return {
		isPending: skip.isPending || unskip.isPending || change.isPending,
		/** Skips the next due date. */
		skipNext: (item: SubscriptionItem) => {
			if (item.nextDueOn === null) return Promise.resolve(false);
			const body = {
				dueOn: item.nextDueOn,
				changedAt: new Date().toISOString(),
			};
			return send(
				item,
				"skip",
				{ kind: "skip", id: item.id, body },
				() =>
					skip.mutateAsync({
						id: item.id,
						version: item.version,
						body,
						idempotencyKey: uuidV7(),
					}),
				(saved) => ({
					kind: "skip",
					before: item,
					saved,
					dueOn: body.dueOn,
				}),
			);
		},
		/** Brings a skipped date back. */
		undoSkip: (item: SubscriptionItem, dueOn: string) => {
			const body = { changedAt: new Date().toISOString() };
			return send(
				item,
				"unskip",
				{ kind: "unskip", id: item.id, dueOn, body },
				() =>
					unskip.mutateAsync({
						id: item.id,
						dueOn,
						version: item.version,
						body,
						idempotencyKey: uuidV7(),
					}),
				(saved) => ({ kind: "unskip", before: item, saved, dueOn }),
			);
		},
		/** Ends a pause today, or clears one that has not started. */
		resumeNow: (item: SubscriptionItem) => {
			if (item.pause === null) return Promise.resolve(false);
			const body = {
				changedAt: new Date().toISOString(),
				pause: resumeNowPause(item.pause, locale.today),
			};
			return send(
				item,
				"resumeNow",
				{ kind: "change", id: item.id, body },
				() =>
					change.mutateAsync({
						id: item.id,
						version: item.version,
						body,
						idempotencyKey: uuidV7(),
					}),
				(saved) => ({
					kind: "resumeNow",
					before: item,
					saved,
					sent: body,
				}),
			);
		},
	};
}
