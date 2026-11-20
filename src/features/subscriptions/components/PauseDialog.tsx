"use client";

import { useForm, useSelector } from "@tanstack/react-form";
import { useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { DatePicker } from "@/components/forms/DatePicker";
import { ToggleChips } from "@/components/forms/ToggleChips";
import { Dialog } from "@/components/surfaces/Dialog";
import { useOnce } from "@/hooks/useOnce";
import { useOnline } from "@/hooks/useOnline";
import { formatDayHeader } from "@/lib/date-format";
import { uuidV7 } from "@/lib/ids";
import { useChangeSubscription } from "../hooks/useChangeSubscription";
import { useWriteRefusal } from "../hooks/useWriteRefusal";
import { DIALOG_TEXT } from "../lib/dialog";
import {
	PAUSE_TEXT,
	type PauseChoice,
	pauseOptions,
	pauseRange,
	pauseStart,
	type PauseValues,
	pauseView,
} from "../lib/pause";
import type {
	SubscriptionAnswer,
	SubscriptionItem,
	SubscriptionsLocale,
} from "../lib/types";
import { ChargesStrip } from "./ChargesStrip";

export type PauseDialogProps = {
	isOpen: boolean;
	/** The Subscription to pause, or one whose pause is to be changed. */
	item: SubscriptionItem;
	locale: SubscriptionsLocale;
	onClose: () => void;
	/** A confirmed write, with the Subscription as the server saved it. */
	onSaved?: (saved: SubscriptionAnswer) => void;
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
	const online = useOnline();
	const change = useChangeSubscription();
	const refusal = useWriteRefusal(["pause"]);
	const sending = useOnce();
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
		const request = sending.run(() =>
			change.mutateAsync({
				id: opened.id,
				version: opened.version,
				body,
				idempotencyKey: uuidV7(),
			}),
		);
		if (request === null) return;
		refusal.reset();
		try {
			const saved = await request;
			onSaved?.(saved);
			onClose();
		} catch (error) {
			await refusal.refuse(error);
		}
	};

	const busy = change.isPending;
	const canSave = online && view.body !== null;
	return (
		<Dialog
			title={PAUSE_TEXT.title(name)}
			isOpen={isOpen}
			// It only ever reports closing.
			onOpenChange={onClose}
			isPending={busy}
			footer={
				<>
					<span className="flex-1" />
					<Button
						variant="secondary"
						isDisabled={busy}
						onPress={onClose}
						className="max-md:hidden"
					>
						{PAUSE_TEXT.notNow}
					</Button>
					<Button
						isDisabled={!canSave}
						isPending={busy}
						onPress={() => void form.handleSubmit()}
					>
						{view.buttonLabel}
					</Button>
				</>
			}
		>
			<form
				noValidate
				aria-label={PAUSE_TEXT.title(name)}
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					if (canSave) void form.handleSubmit();
				}}
			>
				{!online && <OfflineNote>{DIALOG_TEXT.offline}</OfflineNote>}
				{refusal.failure && <FormAlert>{refusal.failure}</FormAlert>}
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
			</form>
		</Dialog>
	);
}
