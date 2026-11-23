import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useOnce } from "@/hooks/useOnce";
import { uuidV7 } from "@/lib/ids";
import type {
	SubscriptionDeleteInput,
	SubscriptionEditInput,
	SubscriptionSkipInput,
	SubscriptionUnskipInput,
} from "@/lib/subscriptions/schemas";
import {
	applyRequest,
	CONFLICT_TEXT,
	type ChangeRequest,
	type ConflictFields,
	fieldsOf,
} from "../lib/conflict";
import {
	type Confirmed,
	confirmedNotice,
	msUntilMidnight,
	type UndoPlan,
	type WriteKind,
	type WriteNotice,
} from "../lib/notices";
import { refreshAfterSubscriptionWrite } from "../lib/refresh";
import type {
	SubscriptionAnswer,
	SubscriptionChanged,
	SubscriptionDeleted,
	SubscriptionItem,
	SubscriptionsLocale,
} from "../lib/types";
import {
	readSubscriptionNoticeError,
	type SubscriptionNoticeOutcome,
} from "../lib/write-errors";
import { useChangeSubscription } from "./useChangeSubscription";
import { useDeleteSubscription } from "./useDeleteSubscription";
import { useSkipCharge } from "./useSkipCharge";
import { useUnskipCharge } from "./useUnskipCharge";

/** The notice on the page (BR-F05-33): a confirmed write with Undo, a delete with Dismiss alone,
 * or a failure, which has Dismiss alone too. `id` tells one notice from the next. */
export type SubscriptionNotice = WriteNotice & {
	id: number;
	failure: string | null;
};

/** A 409 on an Undo or a write with no dialog: what the conflict view shows (BR-F05-34). */
export type NoticeConflict = {
	/** The Subscription saved now. */
	current: SubscriptionAnswer;
	/** The user's version: what each choice leaves if Keep mine is chosen. */
	yours: ConflictFields;
	/** What Keep mine does, under the table. */
	line: string;
	/** A delete: "Delete anyway" and "Keep it". */
	isDelete: boolean;
};

/** A write with no dialog that could not be sent against the version the page held. */
export type RefusedWrite = {
	kind: WriteKind;
	request: ChangeRequest;
	/** The Subscription as the write was sent from it. */
	before: SubscriptionItem;
};

/** What each pending conflict is about. An Undo's ends with its notice. */
type Pending =
	| { source: "undo"; noticeId: number; plan: UndoPlan }
	| ({ source: "write" } & RefusedWrite);

/** What the page shows of the notice and the writes behind it. */
export type SubscriptionNotices = {
	notice: SubscriptionNotice | null;
	/** A confirmed write's notice replaces the one before it. */
	confirm: (confirmed: Confirmed) => void;
	/** A notice that only reads `text`, with Dismiss: a write that could not be sent. */
	fail: (subscriptionId: string, text: string) => void;
	/** What a refused write with no dialog shows: the conflict view, or a failure notice. */
	refused: (error: unknown, write: RefusedWrite) => Promise<void>;
	/** Sends what Undo undoes, once at a time; the notice ends when it is confirmed and reads
	 * the failure when it is not. */
	undo: () => void;
	dismiss: () => void;
	isUndoing: boolean;
	/** The conflict view's content after a 409 on Undo or a write, or `null`. */
	conflict: NoticeConflict | null;
	/** Keep mine, or "Delete anyway": the write again, against the saved version. */
	keepMine: () => void;
	/** Keep theirs, or "Keep it": nothing is sent and the saved Subscription shows. */
	keepTheirs: () => void;
	/** Closing the view without a choice: nothing is sent and the notice stays. */
	closeConflict: () => void;
};

/** What the conflict view shows for a refused `pending` write, against the Subscription saved
 * now (BR-F05-34): the user's version, and what Keep mine does. */
function conflictFor(
	current: SubscriptionAnswer,
	pending: Pending,
): NoticeConflict & { pending: Pending } {
	const undoing = pending.source === "undo";
	const request = undoing ? pending.plan.request : pending.request;
	const isDelete = request.kind === "delete";
	const origin = undoing ? pending.plan.origin : fieldsOf(pending.before);
	let line: string = CONFLICT_TEXT.writeLine;
	if (isDelete) line = CONFLICT_TEXT.deleteLine;
	else if (undoing) line = CONFLICT_TEXT.undoLine;
	return {
		current,
		yours:
			isDelete ?
				(origin ?? fieldsOf(current))
			:	applyRequest(fieldsOf(current), request),
		line,
		isDelete,
		pending,
	};
}

/** The same delete without `undo: "create"`: a plain delete, whose charges stay (BR-F05-34). */
function plainDelete(request: ChangeRequest): ChangeRequest {
	if (request.kind !== "delete") return request;
	const { changedAt } = request.body;
	return {
		kind: "delete",
		id: request.id,
		body: changedAt === undefined ? {} : { changedAt },
	};
}

/**
 * The page's inline notice, never a toast (BR-F05-33), and the writes that come with it: Undo,
 * which sends what its plan holds (BR-F05-34). It lasts until Undo, Dismiss, the next write or
 * midnight in the profile's time zone (D-597), so an Undo keeps its write's change date. Each
 * Undo is sent at once with a new key; refused, the notice reads why with Dismiss. A version
 * conflict opens the conflict view instead: Keep mine sends the write again against the saved
 * version, Keep theirs sends nothing. An answer that arrives after the notice has been
 * replaced leaves the newer one alone.
 */
export function useSubscriptionNotice(
	locale: SubscriptionsLocale,
): SubscriptionNotices {
	const queryClient = useQueryClient();
	const [notice, setNotice] = useState<SubscriptionNotice | null>(null);
	const [conflictOf, setConflictOf] = useState<
		(NoticeConflict & { pending: Pending }) | null
	>(null);
	const counter = useRef(0);
	// One send at a time for Undo and for Keep mine, taken on the press itself (D-575).
	const sending = useOnce();
	const change = useChangeSubscription();
	const remove = useDeleteSubscription();
	const skip = useSkipCharge();
	const unskip = useUnskipCharge();

	// A conflict that arrives after its Undo's notice has ended or been replaced is not shown.
	if (
		conflictOf !== null
		&& conflictOf.pending.source === "undo"
		&& notice?.id !== conflictOf.pending.noticeId
	) {
		setConflictOf(null);
	}

	// The notice ends at midnight in the profile's zone (BR-F05-33).
	const noticeId = notice?.id ?? null;
	const { timezone } = locale;
	useEffect(() => {
		if (noticeId === null) return;
		const timer = setTimeout(
			() => setNotice((was) => (was?.id === noticeId ? null : was)),
			msUntilMidnight(new Date(), timezone),
		);
		return () => clearTimeout(timer);
	}, [noticeId, timezone]);

	const show = (next: WriteNotice) => {
		counter.current += 1;
		setNotice({ ...next, id: counter.current, failure: null });
	};
	const confirm = (confirmed: Confirmed) =>
		show(confirmedNotice(confirmed, locale));
	const fail = (subscriptionId: string, text: string) => {
		counter.current += 1;
		setNotice({
			subscriptionId,
			text: "",
			undo: null,
			inPanel: true,
			id: counter.current,
			failure: text,
		});
	};
	/** The notice reads `message` instead, if it is still the one that was asked for. */
	const failUndo = (id: number, message: string) =>
		setNotice((was) =>
			was?.id === id ? { ...was, undo: null, failure: message } : was,
		);
	const clear = (id: number) => setNotice((was) => (was?.id === id ? null : was));

	/** Sends `request` against `version`: the notice's own, or after a conflict the saved one. */
	const send = (request: ChangeRequest, version: number) => {
		const changedAt = request.body.changedAt ?? new Date().toISOString();
		const idempotencyKey = uuidV7();
		switch (request.kind) {
			case "change":
				return change.mutateAsync({
					id: request.id,
					version,
					body: { ...request.body, changedAt } as SubscriptionEditInput,
					idempotencyKey,
				});
			case "delete":
				return remove.mutateAsync({
					id: request.id,
					version,
					body: { ...request.body, changedAt } as SubscriptionDeleteInput,
					idempotencyKey,
				});
			case "skip":
				return skip.mutateAsync({
					id: request.id,
					version,
					body: { ...request.body, changedAt } as SubscriptionSkipInput,
					idempotencyKey,
				});
			case "unskip":
				return unskip.mutateAsync({
					id: request.id,
					dueOn: request.dueOn,
					version,
					body: { ...request.body, changedAt } as SubscriptionUnskipInput,
					idempotencyKey,
				});
		}
	};
	const isUndoing =
		change.isPending || remove.isPending || skip.isPending || unskip.isPending;

	/** What a write's answer is to the notice of the write it was: a write with no dialog that
	 * was resent after a conflict, from the Subscription as it was saved then. */
	const confirmedBy = (
		write: RefusedWrite,
		answer: unknown,
		before: SubscriptionItem,
	): Confirmed => {
		const { request, kind } = write;
		if (request.kind === "skip") {
			return {
				kind: "skip",
				before,
				saved: answer as SubscriptionAnswer,
				dueOn: request.body.dueOn,
			};
		}
		if (request.kind === "unskip") {
			return {
				kind: "unskip",
				before,
				saved: answer as SubscriptionAnswer,
				dueOn: request.dueOn,
			};
		}
		if (request.kind === "delete") {
			return {
				kind: "delete",
				before,
				saved: answer as SubscriptionDeleted | null,
			};
		}
		return {
			kind: kind as "edit",
			before,
			saved: answer as SubscriptionChanged,
			sent: request.body as SubscriptionEditInput,
		};
	};

	/** What a refusal does: the conflict view, or the notice's failure. */
	const refuse = async (outcome: SubscriptionNoticeOutcome, pending: Pending) => {
		const id =
			pending.source === "undo" ? pending.plan.request.id : pending.request.id;
		if (outcome.kind === "conflict") {
			setConflictOf(conflictFor(outcome.current, pending));
			return;
		}
		setConflictOf(null);
		if (outcome.kind === "handled") return;
		if (outcome.kind === "gone") {
			await refreshAfterSubscriptionWrite(queryClient, {
				count: true,
				charges: true,
			});
		}
		if (pending.source === "undo") failUndo(pending.noticeId, outcome.message);
		else fail(id, outcome.message);
	};

	const refused = async (error: unknown, write: RefusedWrite) =>
		refuse(readSubscriptionNoticeError(error, { undo: false }), {
			source: "write",
			...write,
		});

	const undo = () => {
		if (notice === null || notice.undo === null) return;
		const { id, undo: plan } = notice;
		void sending
			.run(() => send(plan.request, plan.version))
			?.then(
				() => clear(id),
				(error: unknown) =>
					refuse(readSubscriptionNoticeError(error, { undo: true }), {
						source: "undo",
						noticeId: id,
						plan,
					}),
			);
	};

	const keepMine = () => {
		if (conflictOf === null || sending.isRunning()) return;
		const { pending, current } = conflictOf;
		if (pending.source === "undo") {
			const { noticeId: id, plan } = pending;
			void sending
				.run(() => send(plainDelete(plan.request), current.version))
				?.then(
					() => {
						setConflictOf(null);
						clear(id);
					},
					(error: unknown) =>
						refuse(
							readSubscriptionNoticeError(error, { undo: true }),
							pending,
						),
				);
			return;
		}
		void sending
			.run(() => send(pending.request, current.version))
			?.then(
				(answer) => {
					setConflictOf(null);
					confirm(confirmedBy(pending, answer, current));
				},
				(error: unknown) =>
					refuse(
						readSubscriptionNoticeError(error, { undo: false }),
						pending,
					),
			);
	};

	const keepTheirs = () => {
		if (conflictOf === null) return;
		const { pending } = conflictOf;
		setConflictOf(null);
		void refreshAfterSubscriptionWrite(queryClient, {
			count: false,
			charges: false,
		});
		if (pending.source === "undo") clear(pending.noticeId);
	};

	return {
		notice,
		confirm,
		fail,
		refused,
		undo,
		dismiss: () => setNotice(null),
		isUndoing,
		conflict:
			conflictOf === null ? null : (
				{
					current: conflictOf.current,
					yours: conflictOf.yours,
					line: conflictOf.line,
					isDelete: conflictOf.isDelete,
				}
			),
		keepMine,
		keepTheirs,
		closeConflict: () => setConflictOf(null),
	};
}
