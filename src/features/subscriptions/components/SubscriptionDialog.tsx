"use client";

import {
	type AnyFieldApi,
	revalidateLogic,
	useForm,
	useSelector,
} from "@tanstack/react-form";
import { useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { AmountInput } from "@/components/forms/AmountInput";
import { CategoryTiles } from "@/components/forms/CategoryTiles";
import { DatePicker } from "@/components/forms/DatePicker";
import { TextInput } from "@/components/forms/TextInput";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { formatAmountInput, parseAmount } from "@/lib/amount";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { formatDayHeader } from "@/lib/date-format";
import type { ExpenseCategory } from "@/lib/subscriptions/model";
import { startDateWindow } from "@/lib/subscriptions/schemas";
import { useBackfillDuplicates } from "../hooks/useBackfillDuplicates";
import { usePaidPayees } from "../hooks/usePaidPayees";
import { type PayeeFill, usePayeeFill } from "../hooks/usePayeeFill";
import { useSubscriptionCharges } from "../hooks/useSubscriptionCharges";
import { useSubscriptionSave } from "../hooks/useSubscriptionSave";
import {
	addView,
	DIALOG_TEXT,
	type DialogField,
	type DialogValues,
	duplicateNote,
	editSchedule,
	fieldMessages,
	NOTE_MAX,
	SERVER_FIELD,
	startValues,
	wasHints,
	yesterday,
} from "../lib/dialog";
import { fieldsOf } from "../lib/conflict";
import { editView } from "../lib/edit-plan";
import type { Confirmed } from "../lib/notices";
import { payeeChoices } from "../lib/payees";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { CadenceField } from "./CadenceField";
import { ChargesRetry } from "./ChargesRetry";
import { DialogConflict } from "./DialogConflict";
import { WriteDialog } from "./WriteDialog";
import { PastCharges } from "./PastCharges";
import { PayeeField } from "./PayeeField";
import { ScheduleLine } from "./ScheduleLine";
import { WhatChanges } from "./WhatChanges";

export type SubscriptionDialogProps = {
	isOpen: boolean;
	/** The Subscription to edit, or `null` for Add a Subscription. */
	item: SubscriptionItem | null;
	/** Every Subscription, for the cost line of an Edit. */
	items: readonly SubscriptionItem[];
	locale: SubscriptionsLocale;
	onClose: () => void;
	/** A confirmed write: the Subscription before it (an Edit), as the server saved it, and what
	 * was sent. */
	onSaved?: (confirmed: Confirmed) => void;
};

/** The note's character counter, shown from 400 characters. */
const counterOf = (text: string) =>
	text.length > 400 ? { counter: `${text.length} / ${NOTE_MAX}` } : {};

/**
 * "Add a Subscription" and "Edit Netflix" (BR-F05-24): a bottom sheet on phones. Name, Amount,
 * How often, Category, Started on, the schedule line, on Add the past-charges choice, a note
 * behind "Add a note", and on Edit "What changes". The fields are a TanStack Form checked by
 * F05's own schemas, each field again as it changes after a first refused Save, and Save moves
 * focus to the first message (D-169, D-616). Save sends one request with a new key per press:
 * `POST` for an Add, `PATCH` at the version the dialog opened with for an Edit, which sends
 * only the fields that changed (BR-F05-46) and closes when none did. A refusal keeps the dialog
 * open with its message, under a field or at the top. Before M5 Save is disabled offline, and
 * on Edit until the Subscription's charges have loaded, which "What changes" reads.
 */
export function SubscriptionDialog({
	isOpen,
	item,
	items,
	locale,
	onClose,
	onSaved,
}: Readonly<SubscriptionDialogProps>) {
	// The dialog works on the Subscription as it was when it opened, so a refetch of the page
	// while it is open never moves the version a save is made against: another device's change
	// then meets a 409, not a silent overwrite (BR-F05-34).
	const [edited] = useState(item);
	const [start] = useState(() => startValues(edited, locale));
	const [noteOpen, setNoteOpen] = useState(start.note !== "");
	// "Add a note" takes its own button away, so the note it opens takes focus, not the Name.
	const [noteFocused, setNoteFocused] = useState(false);
	// The time this dialog opened, only to give the edit schema a well-formed `changedAt` for
	// the preview; each Save sends its own.
	const [openedAt] = useState(() => new Date().toISOString());
	const formRef = useRef<HTMLFormElement>(null);
	const focusInvalid = useFocusFirstInvalid(formRef);
	const adding = edited === null;
	const charges = useSubscriptionCharges(edited?.id ?? null);
	const { save, refusal, conflictView, busy } = useSubscriptionSave({
		edited,
		items,
		locale,
		charges: charges.data ?? [],
		onClose,
		onSaved,
		onFieldsRefused: focusInvalid,
	});
	const { failure } = refusal;

	const form = useForm({
		defaultValues: start,
		validationLogic: revalidateLogic(),
		validators: {
			onDynamic: ({ value }) => {
				const messages = fieldMessages(value, locale, edited);
				// The cadence's message sits under the custom number.
				const { cadence, ...rest } = messages;
				const fields: Partial<Record<keyof DialogValues, string>> = rest;
				if (cadence !== undefined) fields.every = cadence;
				return Object.keys(fields).length > 0 ? { fields } : undefined;
			},
		},
		onSubmitInvalid: focusInvalid,
		onSubmit: ({ value }) => save(value),
	});
	const values = useSelector(form.store, (state) => state.values);

	const chargesReady = adding || charges.data !== undefined;
	const chargesFailed =
		!adding
		&& charges.data === undefined
		&& (charges.isError || charges.fetchStatus === "paused");
	const messages = fieldMessages(values, locale, edited);
	const view =
		edited === null ? null : (
			editView({
				item: edited,
				items,
				values,
				messages,
				charges: charges.data ?? [],
				locale,
				changedAt: openedAt,
			})
		);
	const add = addView(values, locale);
	const schedule =
		edited === null ?
			add.schedule
		:	view && editSchedule(values, view.nextDates, locale);
	// A custom number out of range says so as it is typed, before the first Save (BR-F05-24).
	const customMessage = values.preset === "custom" ? messages.cadence : undefined;
	const was = edited === null ? {} : wasHints(edited, values, locale);
	const nameHint = was.name === undefined ? {} : { hint: was.name };
	const typed = parseAmount(values.amount, locale);
	const nameText = values.name.trim();
	const { min, max } = startDateWindow(locale.today);

	// Add's Name lists the payees paid before; Edit's is plain text (BR-F05-24).
	const { data: payees } = usePaidPayees({ enabled: adding });
	const choices = adding ? payeeChoices(payees ?? [], values.name) : [];
	const duplicates = useBackfillDuplicates({
		name: adding && add.past !== null ? nameText : "",
		from: values.startDate,
		to: yesterday(locale.today),
	});
	const duplicateDates = (duplicates.data ?? []).map((row) => row.occurredOn);
	/** Clears what the server said about a field once it changes. */
	const changed = (field: DialogField) => refusal.clearField(SERVER_FIELD[field]);

	/** A payee was chosen: its category and amount fill in, and what the server said of those
	 * fields goes (BR-F05-24). */
	const fill = (filling: PayeeFill) => {
		form.setFieldValue("name", filling.name);
		form.setFieldValue("category", filling.category);
		form.setFieldValue("amount", filling.amount);
		for (const field of ["name", "category", "amount"] as const) changed(field);
	};
	const payee = usePayeeFill({ values, locale, onFill: fill });

	/** A field's message: the server's refusal of it, else the first of its own checks. */
	const messageOf = (field: AnyFieldApi, key: DialogField) =>
		refusal.fields[SERVER_FIELD[key]]
		?? (field.state.meta.errors as (string | undefined)[])[0];
	const title =
		edited === null ? DIALOG_TEXT.addTitle : DIALOG_TEXT.editTitle(edited.name);
	return (
		<>
			<WriteDialog
				title={title}
				isOpen={isOpen}
				onClose={onClose}
				size="lg"
				isPending={busy}
				failure={failure}
				dismissLabel={DIALOG_TEXT.cancel}
				confirmLabel={adding ? DIALOG_TEXT.add : DIALOG_TEXT.save}
				isReady={chargesReady}
				onConfirm={() => void form.handleSubmit()}
				formRef={formRef}
			>
				<form.Field name="name">
					{(field) =>
						adding ?
							<PayeeField
								autoFocus
								value={field.state.value}
								onChange={(text) => {
									field.handleChange(text);
									changed("name");
								}}
								choices={choices}
								onChoose={payee.choose}
								hint={payee.hint}
								error={messageOf(field, "name")}
								isDisabled={busy}
							/>
						:	<TextInput
								label={DIALOG_TEXT.name}
								placeholder={DIALOG_TEXT.namePlaceholder}
								value={field.state.value}
								onChange={(text) => {
									field.handleChange(text);
									changed("name");
								}}
								{...nameHint}
								error={messageOf(field, "name")}
								isDisabled={busy}
							/>
					}
				</form.Field>
				<div className="grid gap-3.5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
					<form.Field name="amount">
						{(field) => (
							<AmountInput
								label={DIALOG_TEXT.amount}
								name="amount"
								currency={locale.currency}
								numberLocale={locale.numberLocale}
								value={field.state.value}
								onChange={(text) => {
									field.handleChange(text);
									changed("amount");
								}}
								onBlur={() => {
									if (typed.ok) {
										field.handleChange(
											formatAmountInput(typed.minor, locale),
										);
									}
								}}
								{...(was.amount === undefined ?
									{}
								:	{ hint: was.amount })}
								error={messageOf(field, "amount")}
								isDisabled={busy}
							/>
						)}
					</form.Field>
					<form.Field name="every">
						{(field) => (
							<CadenceField
								preset={values.preset}
								onPresetChange={(preset) => {
									form.setFieldValue("preset", preset);
									changed("cadence");
								}}
								every={field.state.value}
								onEveryChange={(every) => {
									field.handleChange(every);
									changed("cadence");
								}}
								unit={values.unit}
								onUnitChange={(unit) => {
									form.setFieldValue("unit", unit);
									changed("cadence");
								}}
								error={messageOf(field, "cadence") ?? customMessage}
								was={was.cadence}
								isDisabled={busy}
							/>
						)}
					</form.Field>
				</div>
				<form.Field name="category">
					{(field) => (
						<CategoryTiles
							tiles={EXPENSE_CATEGORIES}
							value={field.state.value}
							onChange={(next) => {
								field.handleChange(next as ExpenseCategory);
								changed("category");
							}}
							hint={was.category}
							error={messageOf(field, "category")}
							isDisabled={busy}
						/>
					)}
				</form.Field>
				<form.Field name="startDate">
					{(field) => (
						<DatePicker
							label={DIALOG_TEXT.startedOn}
							value={field.state.value}
							onChange={(date) => {
								field.handleChange(date);
								changed("startDate");
							}}
							display={formatDayHeader(field.state.value, locale)}
							today={locale.today}
							minValue={min}
							maxValue={max}
							firstDayOfWeek={locale.weekStart}
							hint={was.startDate ?? DIALOG_TEXT.startedHint}
							error={messageOf(field, "startDate")}
							isDisabled={busy}
						/>
					)}
				</form.Field>
				{schedule && <ScheduleLine summary={schedule} />}
				{adding && add.past !== null && (
					<PastCharges
						choices={add.past}
						value={values.past}
						onChange={(past) => form.setFieldValue("past", past)}
						duplicates={duplicateNote(nameText, duplicateDates, locale)}
						isDisabled={busy}
					/>
				)}
				<form.Field name="note">
					{(field) =>
						noteOpen ?
							<TextInput
								label={DIALOG_TEXT.note}
								multiline
								rows={2}
								optional
								autoFocus={noteFocused}
								value={field.state.value}
								onChange={(text) => {
									field.handleChange(text.slice(0, NOTE_MAX));
									changed("note");
								}}
								{...counterOf(field.state.value)}
								error={messageOf(field, "note")}
								isDisabled={busy}
							/>
						:	<Button
								variant="row"
								size="sm"
								className="self-start"
								onPress={() => {
									setNoteOpen(true);
									setNoteFocused(true);
								}}
							>
								{DIALOG_TEXT.addNote}
							</Button>
					}
				</form.Field>
				{chargesFailed && (
					<ChargesRetry
						message={DIALOG_TEXT.chargesFailed}
						retryLabel={DIALOG_TEXT.retry}
						onRetry={() => void charges.refetch()}
					/>
				)}
				{view?.preview && (
					<WhatChanges
						view={view}
						skipDouble={values.skipDouble}
						onSkipDoubleChange={(ticked) =>
							form.setFieldValue("skipDouble", ticked)
						}
						alsoPast={values.alsoPast}
						onAlsoPastChange={(ticked) =>
							form.setFieldValue("alsoPast", ticked)
						}
						isDisabled={busy}
					/>
				)}
				{view?.noteOnly && (
					<p className="text-caption text-ink-2">{DIALOG_TEXT.noteOnly}</p>
				)}
			</WriteDialog>
			{edited !== null && conflictView && (
				<DialogConflict
					{...conflictView}
					origin={fieldsOf(edited)}
					formats={locale}
				/>
			)}
		</>
	);
}
