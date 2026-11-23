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
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { amountMessage, formatAmountInput, parseAmount } from "@/lib/amount";
import { useSubscriptionCharges } from "../hooks/useSubscriptionCharges";
import { useEditWrite } from "../hooks/useEditWrite";
import { fieldsOf } from "../lib/conflict";
import { DIALOG_TEXT } from "../lib/dialog";
import { amountWithCadence } from "../lib/labels";
import { RESUME_TEXT, type ResumeChoice, resumeView } from "../lib/resume";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { DialogConflict } from "./DialogConflict";
import { WriteDialog } from "./WriteDialog";
import { ChargesRetry } from "./ChargesRetry";
import { ChargesStrip } from "./ChargesStrip";

export type ResumeDialogProps = {
	isOpen: boolean;
	/** The Subscription to resume: an ended one, or an ending one whose end date is cleared. */
	item: SubscriptionItem;
	locale: SubscriptionsLocale;
	onClose: () => void;
	/** A confirmed write: the Subscription before it, as the server saved it, and what was sent. */
	onSaved?: (confirmed: Confirmed) => void;
};

/** The fields the user fills in: the choice, and the price when "Change the price too" is open. */
type ResumeValues = {
	choice: ResumeChoice;
	priceOpen: boolean;
	amount: string;
};

/**
 * "Resume Netflix?" and Keep it going (BR-F05-13, BR-F05-32, BR-F05-42): where it ended, then for
 * an ended Subscription with missed dates "Restart from today" or "It never actually stopped",
 * which also adds them (`backfillGap`); otherwise one line on what resuming does. A strip shows
 * the result, and the price can be changed in the same write under "Change the price too".
 * Save sends one `PATCH` that clears the end date at the version the dialog opened with, and
 * rests until the charges have loaded; before M5 it is also disabled offline.
 */
export function ResumeDialog({
	isOpen,
	item,
	locale,
	onClose,
	onSaved,
}: Readonly<ResumeDialogProps>) {
	const [opened] = useState(item);
	const charges = useSubscriptionCharges(opened.id);
	const formRef = useRef<HTMLFormElement>(null);
	const focusInvalid = useFocusFirstInvalid(formRef);
	const { change, refusal, submit, conflictView } = useEditWrite({
		kind: "resume",
		own: ["amountMinor"],
		onClose,
		onSaved,
		onFieldsRefused: focusInvalid,
	});
	const [openedAt] = useState(() => new Date().toISOString());
	const [start] = useState<ResumeValues>(() => ({
		choice: "today",
		priceOpen: false,
		amount: formatAmountInput(opened.amountMinor, locale),
	}));

	const form = useForm({
		defaultValues: start,
		validationLogic: revalidateLogic(),
		validators: {
			onDynamic: ({ value }) => {
				if (!value.priceOpen) return undefined;
				const typed = parseAmount(value.amount, locale);
				return typed.ok ? undefined : (
						{ fields: { amount: amountMessage(typed.error, locale) } }
					);
			},
		},
		onSubmitInvalid: focusInvalid,
		onSubmit: ({ value }) => save(value),
	});
	const values = useSelector(form.store, (state) => state.values);
	const typed = parseAmount(values.amount, locale);
	/** The price typed, while "Change the price too" is open and it is an amount. */
	const priceOf = (entered: ResumeValues) => {
		const read = parseAmount(entered.amount, locale);
		return entered.priceOpen && read.ok ? read.minor : null;
	};
	const ready = charges.data !== undefined;
	const failed = !ready && (charges.isError || charges.fetchStatus === "paused");
	const build = (entered: ResumeValues, changedAt: string) =>
		resumeView({
			item: opened,
			charges: charges.data ?? [],
			never: entered.choice === "never",
			newAmountMinor: priceOf(entered),
			locale,
			changedAt,
		});
	const view = build(values, openedAt);
	const name = opened.name;

	const save = async (entered: ResumeValues) => {
		const { body } = build(entered, new Date().toISOString());
		await submit(body, opened);
	};

	const messageOf = (field: AnyFieldApi) =>
		refusal.fields.amountMinor
		?? (field.state.meta.errors as (string | undefined)[])[0];
	const busy = change.isPending;
	return (
		<>
			<WriteDialog
				title={RESUME_TEXT.title(name)}
				isOpen={isOpen}
				onClose={onClose}
				isPending={busy}
				failure={refusal.failure}
				dismissLabel={RESUME_TEXT.notNow}
				confirmLabel={RESUME_TEXT.resume(name)}
				isReady={ready}
				onConfirm={() => void form.handleSubmit()}
				formRef={formRef}
			>
				<p className="text-label text-ink-2">{view.opening}</p>
				{/* Which dates were missed is only known once the charges are in. */}
				{ready
					&& (view.choices !== null ?
						<form.Field name="choice">
							{(field) => (
								<ChoiceGroup
									label={RESUME_TEXT.how}
									value={field.state.value}
									onChange={(next) =>
										field.handleChange(next as ResumeChoice)
									}
									options={[
										{
											value: "today",
											label: RESUME_TEXT.today,
											description: RESUME_TEXT.todayDetail,
										},
										{
											value: "never",
											label: view.choices?.never.title ?? "",
											description:
												view.choices?.never.description
												?? "",
										},
									]}
									isDisabled={busy}
								/>
							)}
						</form.Field>
					:	<p className="text-body text-ink">{view.plainLine}</p>)}
				{failed ?
					<ChargesRetry
						message={DIALOG_TEXT.chargesFailed}
						retryLabel={DIALOG_TEXT.retry}
						onRetry={() => void charges.refetch()}
					/>
				:	ready && <ChargesStrip items={view.strip} />}
				{values.priceOpen ?
					<form.Field name="amount">
						{(field) => (
							<AmountInput
								label={RESUME_TEXT.newAmount}
								name="amount"
								autoFocus
								currency={locale.currency}
								numberLocale={locale.numberLocale}
								value={field.state.value}
								onChange={(text) => {
									field.handleChange(text);
									refusal.clearField("amountMinor");
								}}
								onBlur={() => {
									if (typed.ok) {
										field.handleChange(
											formatAmountInput(typed.minor, locale),
										);
									}
								}}
								hint={view.priceHint}
								error={messageOf(field)}
								isDisabled={busy}
							/>
						)}
					</form.Field>
				:	<div className="flex flex-wrap items-center gap-x-2">
						<span className="text-body figures flex-1">
							{amountWithCadence(opened, locale)}
						</span>
						<Button
							size="sm"
							variant="row"
							isDisabled={busy}
							onPress={() => form.setFieldValue("priceOpen", true)}
						>
							{RESUME_TEXT.changePrice}
						</Button>
					</div>
				}
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
