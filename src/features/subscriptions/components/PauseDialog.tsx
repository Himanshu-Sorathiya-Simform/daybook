"use client";

import { useForm, useSelector } from "@tanstack/react-form";
import { useState } from "react";

import { DatePicker } from "@/components/forms/DatePicker";
import { ToggleChips } from "@/components/forms/ToggleChips";
import { formatDayHeader } from "@/lib/date-format";
import { useEditWrite } from "../hooks/useEditWrite";
import { fieldsOf } from "../lib/conflict";
import {
	PAUSE_TEXT,
	type PauseChoice,
	pauseOptions,
	pauseRange,
	pauseStart,
	type PauseValues,
	pauseView,
} from "../lib/pause";
import type { Confirmed } from "../lib/notices";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";
import { DialogConflict } from "./DialogConflict";
import { WriteDialog } from "./WriteDialog";
import { ChargesStrip } from "./ChargesStrip";

export type PauseDialogProps = {
	isOpen: boolean;
	/** The Subscription to pause, or one whose pause is to be changed. */
	item: SubscriptionItem;
	locale: SubscriptionsLocale;
	onClose: () => void;
	/** A confirmed write: the Subscription before it, as the server saved it, and what was sent. */
	onSaved?: (confirmed: Confirmed) => void;
};

/**
 * "Pause Netflix" and Change pause (BR-F05-28, BR-F05-29, BR-F05-43): "Skip" with The next
 * charge, 2 charges, 3 charges or Until a date, a count disabled when no date follows on or
 * before the end date or it falls past the 24-month limit. A strip shows up to three paused
 * charges and the one that resumes, then what happens in words. Change pause on a pause not yet
 * started opens on the date with the stored `until`; on one in force it offers only the date, from
 * today, and keeps its `from`. Save sends one `PATCH` with `pause` at the version the dialog
 * opened with; before M5 it is disabled offline.
 */
export function PauseDialog({
	isOpen,
	item,
	locale,
	onClose,
	onSaved,
}: Readonly<PauseDialogProps>) {
	const [opened] = useState(item);
	const { change, refusal, submit, conflictView } = useEditWrite({
		kind: "pause",
		own: ["pause"],
		onClose,
		onSaved,
	});
	const [start] = useState(() => pauseStart(opened, locale.today));
	const [openedAt] = useState(() => new Date().toISOString());
	const options = pauseOptions(opened, locale.today);
	const range = pauseRange(opened, locale.today);

	const form = useForm({
		defaultValues: start,
		onSubmit: ({ value }) => save(value),
	});
	const values = useSelector(form.store, (state) => state.values);
	const build = (entered: PauseValues, changedAt: string) =>
		pauseView({ item: opened, values: entered, locale, changedAt });
	const view = build(values, openedAt);
	const name = opened.name;

	const save = async (entered: PauseValues) => {
		const { body } = build(entered, new Date().toISOString());
		if (body === null) return;
		await submit(body, opened);
	};

	const busy = change.isPending;
	return (
		<>
			<WriteDialog
				title={PAUSE_TEXT.title(name)}
				isOpen={isOpen}
				onClose={onClose}
				isPending={busy}
				failure={refusal.failure}
				dismissLabel={PAUSE_TEXT.notNow}
				confirmLabel={view.buttonLabel}
				isReady={view.body !== null}
				onConfirm={() => void form.handleSubmit()}
			>
				<div className="flex flex-col gap-1.25">
					<span className="text-caption text-ink font-semibold">
						{PAUSE_TEXT.skip}
					</span>
					<form.Field name="choice">
						{(field) => (
							<ToggleChips
								label={PAUSE_TEXT.skip}
								selectionMode="single"
								options={options}
								value={[field.state.value]}
								onChange={([next]) => {
									if (next === undefined) return;
									field.handleChange(next as PauseChoice);
									refusal.reset();
								}}
								isDisabled={busy}
							/>
						)}
					</form.Field>
				</div>
				{values.choice === "date" && (
					<form.Field name="until">
						{(field) => (
							<DatePicker
								label={PAUSE_TEXT.dateLabel}
								value={field.state.value}
								onChange={(date) => {
									field.handleChange(date);
									refusal.reset();
								}}
								display={formatDayHeader(field.state.value, locale)}
								today={locale.today}
								minValue={range.min}
								maxValue={range.max}
								firstDayOfWeek={locale.weekStart}
								error={refusal.fields.pause}
								isDisabled={busy}
							/>
						)}
					</form.Field>
				)}
				<ChargesStrip items={view.strip} />
				<p className="text-body text-ink">{view.sentence}</p>
				<p className="text-caption text-ink-2">{PAUSE_TEXT.still(name)}</p>
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
