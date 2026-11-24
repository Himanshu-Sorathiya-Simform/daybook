import { useState } from "react";

import { uuidV7 } from "@/lib/ids";
import type { Transaction } from "@/lib/transactions/model";
import { createBody, type DialogValues, OWN_FIELDS, addView } from "../lib/dialog";
import { editView } from "../lib/edit-plan";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { useCreateSubscription } from "./useCreateSubscription";
import { useEditWrite } from "./useEditWrite";

export type SubscriptionSaveOptions = {
	/** The Subscription the dialog opened on, or `null` for an Add. */
	edited: SubscriptionItem | null;
	/** Every Subscription, for an Edit's cost line. */
	items: readonly SubscriptionItem[];
	locale: SubscriptionsLocale;
	/** The Subscription's charges, as far as they have loaded. */
	charges: readonly Transaction[];
	onClose: () => void;
	onSaved?: ((confirmed: Confirmed) => void) | undefined;
	/** A refusal named fields: the dialog moves focus to the first. */
	onFieldsRefused: () => void;
};

/**
 * Save in the Add and Edit dialog (BR-F05-24, BR-F05-46): an Add sends one `POST` with the id
 * the dialog made and a new key per press; an Edit sends one `PATCH` at the version the dialog
 * opened with, only the fields that changed, and only closes when none did. A second press,
 * Enter included, sends nothing while a write is out (D-575, D-615): Add and Edit share the
 * one guard. A refusal lands in `refusal`, and a 409 on an Edit in `conflictView`.
 */
export function useSubscriptionSave({
	edited,
	items,
	locale,
	charges,
	onClose,
	onSaved,
	onFieldsRefused,
}: SubscriptionSaveOptions) {
	const create = useCreateSubscription();
	const [id] = useState(() => uuidV7());
	const { change, refusal, sending, submit, conflictView } = useEditWrite({
		kind: "edit",
		own: OWN_FIELDS,
		onClose,
		onSaved,
		onFieldsRefused,
	});

	/** An Add: one `POST`. */
	const add = async (entered: DialogValues) => {
		const body = createBody(entered, locale, {
			id,
			createdAt: new Date().toISOString(),
			backfill:
				addView(entered, locale).past !== null && entered.past === "yes",
		});
		if (body === null) return;
		const request = sending.run(() =>
			create.mutateAsync({ body, idempotencyKey: uuidV7() }),
		);
		if (request === null) return;
		refusal.reset();
		try {
			const saved = await request;
			onSaved?.({ kind: "add", saved, sent: body });
			onClose();
		} catch (error) {
			const outcome = await refusal.refuse(error);
			if (outcome.kind === "fields") onFieldsRefused();
		}
	};

	/** An Edit: one `PATCH` of what changed, or just a close when nothing did. */
	const edit = async (entered: DialogValues, against: SubscriptionItem) => {
		const next = editView({
			item: against,
			items,
			values: entered,
			messages: {},
			charges,
			locale,
			changedAt: new Date().toISOString(),
		});
		// Nothing changed: Save only closes (BR-F05-24).
		if (next?.body == null) {
			onClose();
			return;
		}
		await submit(next.body, against);
	};

	return {
		/** Save, once the fields check out. */
		save: (entered: DialogValues) =>
			edited === null ? add(entered) : edit(entered, edited),
		refusal,
		conflictView,
		/** A write is out: the choices wait. */
		busy: create.isPending || change.isPending,
	};
}
