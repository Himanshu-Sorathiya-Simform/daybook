"use client";

import { useForm, useSelector } from "@tanstack/react-form";
import { useState } from "react";

import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { DatePicker } from "@/components/forms/DatePicker";
import { formatDayHeader } from "@/lib/date-format";
import { useSubscriptionCharges } from "../hooks/useSubscriptionCharges";
import {
	CANCEL_TEXT,
	type CancelChoice,
	cancelOptions,
	cancelRange,
	cancelStart,
	type CancelValues,
	cancelView,
} from "../lib/cancel";
import { useEditWrite } from "../hooks/useEditWrite";
import { fieldsOf } from "../lib/conflict";
import { DIALOG_TEXT } from "../lib/dialog";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { DialogConflict } from "./DialogConflict";
import { WriteDialog } from "./WriteDialog";
import { ChargesRetry } from "./ChargesRetry";
import { ChargesStrip } from "./ChargesStrip";

export type CancelDialogProps = {
	isOpen: boolean;
	/** The Subscription to cancel, or for an ending one to change the end of. */
	item: SubscriptionItem;
	locale: SubscriptionsLocale;
	onClose: () => void;
	/** A confirmed write: the Subscription before it, as the server saved it, and what was sent. */
	onSaved?: (confirmed: Confirmed) => void;
};

/**
 * "Cancel Netflix?" (BR-F05-12, BR-F05-41): "When does it end?" with Now, After the next charge,
 * On a later date and I cancelled it earlier, a date for the last two, then what the end date
 * deletes (the unedited charges after it, named, and the edited ones that stay), a strip of the
 * charges around today and what happens to the Subscription. The button reads "Cancel and delete
 * 1 charge" in the danger style when charges go. An ending Subscription opens on its stored end
 * date, as Change end date. Save sends one `PATCH` with `endDate` at the version it opened with
 * and rests until the charges have loaded, so a deletion count is never left out (BR-F05-48);
 * before M5 it is also disabled offline.
 */
export function CancelDialog({
	isOpen,
	item,
	locale,
	onClose,
	onSaved,
}: Readonly<CancelDialogProps>) {
	// The Subscription as it was when the dialog opened, so a refetch while it is open never
	// moves the version the write is made against (BR-F05-34).
	const [opened] = useState(item);
	const charges = useSubscriptionCharges(opened.id);
	const { change, refusal, submit, conflictView } = useEditWrite({
		kind: "cancel",
		own: ["endDate"],
		onClose,
		onSaved,
	});
	const [start] = useState(() => cancelStart(opened, locale.today));
	const [openedAt] = useState(() => new Date().toISOString());
	const range = cancelRange(opened, locale.today);
	const options = cancelOptions(opened, locale);

	const form = useForm({
		defaultValues: start,
		onSubmit: ({ value }) => save(value),
	});
	const values = useSelector(form.store, (state) => state.values);
	const ready = charges.data !== undefined;
	const failed = !ready && (charges.isError || charges.fetchStatus === "paused");
	const view = cancelView({
		item: opened,
		values,
		charges: charges.data ?? [],
		locale,
		changedAt: openedAt,
	});
	const name = opened.name;

	const save = async (entered: CancelValues) => {
		const next = cancelView({
			item: opened,
			values: entered,
			charges: charges.data ?? [],
			locale,
			changedAt: new Date().toISOString(),
		});
		// The end date it already has: nothing to write.
		if (next.body === null) {
			onClose();
			return;
		}
		const { body } = next;
		await submit(body, opened);
	};

	const busy = change.isPending;
	const dated = values.choice === "later" || values.choice === "earlier";
	const bounds = values.choice === "later" ? range.later : range.earlier;
	return (
		<>
			<WriteDialog
				title={CANCEL_TEXT.title(name)}
				isOpen={isOpen}
				onClose={onClose}
				isPending={busy}
				failure={refusal.failure}
				dismissLabel={CANCEL_TEXT.keep(name)}
				confirmLabel={
					view.deleted > 0 ?
						CANCEL_TEXT.cancelAndDelete(view.deleted)
					:	CANCEL_TEXT.cancel(name)
				}
				confirmVariant={view.deleted > 0 ? "danger" : "primary"}
				isReady={ready}
				onConfirm={() => void form.handleSubmit()}
			>
				<form.Field name="choice">
					{(field) => (
						<ChoiceGroup
							label={CANCEL_TEXT.question}
							value={field.state.value}
							onChange={(next) => {
								field.handleChange(next as CancelChoice);
								refusal.reset();
							}}
							options={options.map((option) => ({
								value: option.value,
								label: option.label,
								...(option.description === undefined ?
									{}
								:	{ description: option.description }),
							}))}
							isDisabled={busy}
						/>
					)}
				</form.Field>
				{dated && (
					<form.Field
						name={values.choice === "later" ? "later" : "earlier"}
					>
						{(field) => (
							<DatePicker
								label={CANCEL_TEXT.dateLabel}
								value={field.state.value}
								onChange={(date) => {
									field.handleChange(date);
									refusal.reset();
								}}
								display={formatDayHeader(field.state.value, locale)}
								today={locale.today}
								minValue={bounds.min}
								maxValue={bounds.max}
								firstDayOfWeek={locale.weekStart}
								error={refusal.fields.endDate}
								isDisabled={busy}
							/>
						)}
					</form.Field>
				)}
				{view.deletionLine !== null && (
					<p
						role="status"
						className="text-body text-ink font-semibold"
					>
						{view.deletionLine}
					</p>
				)}
				{view.editedLine !== null && (
					<p className="text-caption text-ink-2">{view.editedLine}</p>
				)}
				{failed ?
					<ChargesRetry
						message={DIALOG_TEXT.chargesFailed}
						retryLabel={DIALOG_TEXT.retry}
						onRetry={() => void charges.refetch()}
					/>
				:	ready && <ChargesStrip items={view.strip} />}
				<p className="text-body text-ink-2">{view.endingLine}</p>
			</WriteDialog>
			{conflictView && (
				<DialogConflict
					{...conflictView}
					origin={fieldsOf(opened)}
					formats={locale}
				/>
			)}
		</>
	);
}
