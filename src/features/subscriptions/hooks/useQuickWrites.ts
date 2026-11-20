import { useQueryClient } from "@tanstack/react-query";

import { showToast } from "@/components/feedback/showToast";
import { useOnce } from "@/hooks/useOnce";
import { useOnline } from "@/hooks/useOnline";
import { uuidV7 } from "@/lib/ids";
import { resumeNowPause } from "@/lib/subscriptions/rules";
import { DIALOG_TEXT } from "../lib/dialog";
import { refreshAfterSubscriptionWrite } from "../lib/refresh";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { readSubscriptionNoticeError } from "../lib/write-errors";
import { useChangeSubscription } from "./useChangeSubscription";
import { useSkipCharge } from "./useSkipCharge";
import { useUnskipCharge } from "./useUnskipCharge";

/**
 * The writes that have no dialog (BR-F05-26, BR-F05-27, BR-F05-29): "Skip this one" and "Skip the
 * 5 Nov charge", Undo skip, and Resume now. Each sends one request with a new key per press, at
 * the version the page holds, and a second press while one is out sends nothing (D-615). Before
 * M5 they are online only: offline, a press says so. A refusal says why in a toast, until the
 * notices (BR-F05-33) give it a place; a 404 or 409 also reads the page again.
 */
export function useQuickWrites(locale: Pick<SubscriptionsLocale, "today">) {
	const online = useOnline();
	const queryClient = useQueryClient();
	const skip = useSkipCharge();
	const unskip = useUnskipCharge();
	const change = useChangeSubscription();
	const sending = useOnce();

	const fail = async (error: unknown) => {
		const outcome = readSubscriptionNoticeError(error, { undo: false });
		if (outcome.kind === "handled") return;
		if (outcome.kind === "conflict") {
			showToast(DIALOG_TEXT.conflict, { tone: "error" });
			await refreshAfterSubscriptionWrite(queryClient, {
				count: false,
				charges: false,
			});
		} else if (outcome.kind === "gone") {
			showToast(outcome.message, { tone: "error" });
			await refreshAfterSubscriptionWrite(queryClient, {
				count: true,
				charges: true,
			});
		} else {
			showToast(outcome.message, { tone: "error" });
		}
	};

	/** Sends `write` unless offline or one is already out, and says whether it was confirmed. */
	const send = async (write: () => Promise<unknown>): Promise<boolean> => {
		if (!online) {
			showToast(DIALOG_TEXT.offline, { tone: "error" });
			return false;
		}
		const request = sending.run(write);
		if (request === null) return false;
		try {
			await request;
			return true;
		} catch (error) {
			await fail(error);
			return false;
		}
	};

	return {
		isPending: skip.isPending || unskip.isPending || change.isPending,
		/** Skips the next due date. */
		skipNext: (item: SubscriptionItem) =>
			item.nextDueOn === null ?
				Promise.resolve(false)
			:	send(() =>
					skip.mutateAsync({
						id: item.id,
						version: item.version,
						body: {
							dueOn: item.nextDueOn as string,
							changedAt: new Date().toISOString(),
						},
						idempotencyKey: uuidV7(),
					}),
				),
		/** Brings a skipped date back. */
		undoSkip: (item: SubscriptionItem, dueOn: string) =>
			send(() =>
				unskip.mutateAsync({
					id: item.id,
					dueOn,
					version: item.version,
					body: { changedAt: new Date().toISOString() },
					idempotencyKey: uuidV7(),
				}),
			),
		/** Ends a pause today, or clears one that has not started. */
		resumeNow: (item: SubscriptionItem) =>
			item.pause === null ?
				Promise.resolve(false)
			:	send(() =>
					change.mutateAsync({
						id: item.id,
						version: item.version,
						body: {
							changedAt: new Date().toISOString(),
							pause: resumeNowPause(
								item.pause as NonNullable<typeof item.pause>,
								locale.today,
							),
						},
						idempotencyKey: uuidV7(),
					}),
				),
	};
}
