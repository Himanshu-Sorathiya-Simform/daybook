"use client";

import { type AnyFieldApi, revalidateLogic, useForm } from "@tanstack/react-form";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { AmountInput } from "@/components/forms/AmountInput";
import { CategoryTiles } from "@/components/forms/CategoryTiles";
import { DatePicker } from "@/components/forms/DatePicker";
import { Segmented } from "@/components/forms/Segmented";
import { TextInput } from "@/components/forms/TextInput";
import { TimeField } from "@/components/forms/TimeField";
import { Dialog } from "@/components/surfaces/Dialog";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { useOnline } from "@/hooks/useOnline";
import { shortcutLabel, useShortcut } from "@/hooks/useShortcut";
import { formatDayHeader, formatTime } from "@/lib/date-format";
import type { WeekStart } from "@/lib/geo";
import { todayIn } from "@/lib/time";
import { useEntryPayeeFill } from "../hooks/useEntryPayeeFill";
import { useEntrySave } from "../hooks/useEntrySave";
import { useEntryWrite } from "../hooks/useEntryWrite";
import { useDeleteDialogOpen } from "../hooks/useTransactionDeletes";
import type { SaveKind } from "../hooks/useEntryDialog";
import { usePayees } from "../hooks/usePayees";
import {
	calendarBounds,
	categoryTiles,
	checkEntry,
	counterOf,
	createBody,
	editBody,
	editCalendarNote,
	ENTRY_TEXT,
	ENTRY_TITLES,
	ENTRY_TYPES,
	type EntryField,
	type EntryLocale,
	type EntryMode,
	type EntryType,
	entryDateLabel,
	hasFixedDate,
	isChanged,
	modeValues,
	nextValues,
	rowWindow,
	tidyAmount,
} from "../lib/entry";
import type { TransactionAnswer } from "../lib/types";
import { ChargeNotice } from "./ChargeNotice";
import { DiscardDialog } from "./DiscardDialog";
import { EntryConflictDialog } from "./EntryConflictDialog";
import { FixedDateTime } from "./FixedDateTime";
import { PayeeField } from "./PayeeField";

export type EntryDialogProps = {
	/** A new Transaction (the default), or an edit or a duplicate of a row (BR-F03-48). */
	mode?: EntryMode;
	isOpen: boolean;
	/** Closes it; it never closes itself while a save runs. */
	onClose: () => void;
	/** A create was confirmed (BR-F03-21, D-548). */
	onCreated: (row: TransactionAnswer, kind: SaveKind) => void;
	/** An edit was confirmed (BR-F03-23); the dialog closes itself after. */
	onEdited?: (row: TransactionAnswer) => void;
	/** An edit met a 404: the row was deleted elsewhere (BR-F03-25); the dialog closes itself
	 * after. */
	onGone?: (id: string) => void;
	/** Delete on an edit: the confirm asks over the dialog, which closes through `onConfirmed`
	 * once the delete is confirmed (BR-F03-26, D-84). */
	onDelete?: (row: TransactionAnswer, onConfirmed: () => void) => void;
	locale: EntryLocale;
	firstDayOfWeek: WeekStart;
};

/** Saves from anywhere in the dialog, text fields included (BR-F03-52). */
const SAVE_KEY = "Mod+Enter";

/**
 * The entry dialog (BR-F03-48, BR-F03-75, BR-F03-77): Type, Amount (focused), Payee, Category,
 * Date and Time, Description, and Note behind "Add a note". A bottom sheet below 768 px.
 * - **New:** an expense, today and now in the profile zone (BR-F03-07); the date can be today
 *   or one of the 10 days before (BR-F03-08).
 * - **Duplicate:** a new Transaction with the row's values, dated now (BR-F03-28).
 * - **Edit:** the row's values (D-238). Save sends only what changed, at the row's version,
 *   and closes with no request when nothing did (BR-F03-23, D-552). A changed date must lie in
 *   the row's own window (BR-F03-11). A charge's type, date and time, and a demo row's date and
 *   time, show as text (BR-F03-16, BR-F03-75). A 409 opens the conflict view (BR-F03-24) and a
 *   404 closes it (BR-F03-25). Delete asks "Delete this Transaction?" over it; once confirmed
 *   the dialog closes, unsaved changes and all, and the row is deleted with Undo (BR-F03-26).
 *
 * Save checks every field, then on each change (as F01's forms do), and sends one request with
 * a new key per press. A refusal keeps the dialog open: field messages go under their fields
 * with focus on the first, anything else is one line at the top (flows 7.1 and 7.3). Offline,
 * Save is disabled until M5 (D-241). Ctrl or Cmd+Enter saves, and closing with changes asks
 * first (BR-F03-49).
 */
export function EntryDialog({
	mode: opening = { kind: "new" },
	isOpen,
	onClose,
	onCreated,
	onEdited,
	onGone,
	onDelete,
	locale,
	firstDayOfWeek,
}: Readonly<EntryDialogProps>) {
	const online = useOnline();
	// The delete confirm, open over the dialog, takes the keys while it is.
	const deleting = useDeleteDialogOpen();
	const { data: payees } = usePayees();
	const [opened] = useState(() => new Date());
	const today = todayIn(locale.timezone, opened);
	// "Save and add another" on a duplicate goes on as a new Transaction.
	const [mode, setMode] = useState<EntryMode>(opening);
	const [start, setStart] = useState(() => modeValues(opening, locale, opened));

	const [noteOpen, setNoteOpen] = useState(start.note !== "");
	const [confirming, setConfirming] = useState(false);
	const [restarts, setRestarts] = useState(0);
	const formRef = useRef<HTMLFormElement>(null);
	const kind = useRef<SaveKind>("save");
	const focusInvalid = useFocusFirstInvalid(formRef);
	const editing = mode.kind === "edit" ? mode.row : null;
	const write = useEntryWrite({
		editing,
		locale,
		onClose,
		onFieldsRefused: focusInvalid,
	});
	const entrySave = useEntrySave({
		write,
		editing,
		locale,
		onEdited,
		onGone,
		onClose,
	});
	const { server, failure, conflict } = write;
	const { busy } = entrySave;
	const fixed = editing !== null && hasFixedDate(editing);
	const charge = editing?.source === "subscription";
	const ownWindow = editing ? rowWindow(editing.createdAt, locale.timezone) : null;
	const rules = ownWindow && { start, window: ownWindow };
	const title = ENTRY_TITLES[mode.kind];

	const form = useForm({
		defaultValues: start,
		validationLogic: revalidateLogic(),
		validators: {
			onDynamic: ({ value }) => {
				const checked = checkEntry(
					value,
					locale,
					new Date(),
					rules ?? undefined,
				);
				return checked.ok ? undefined : { fields: checked.fields };
			},
		},
		onSubmitInvalid: focusInvalid,
		onSubmit: async ({ value }) => {
			const now = new Date();
			const checked = checkEntry(value, locale, now, rules ?? undefined);
			if (!checked.ok) return;
			write.reset();
			if (editing) {
				const change = editBody(
					value,
					checked,
					{ row: editing, start },
					locale,
				);
				// Nothing changed: the server refuses an empty edit, so nothing is sent (D-552).
				if (change === null) {
					onClose();
					return;
				}
				await entrySave.sendEdit(change, editing.version);
				return;
			}
			const saving = kind.current;
			const row = await entrySave.sendCreate(
				createBody(value, checked, locale, now),
			);
			if (row === null) return;
			onCreated(row, saving);
			if (saving === "save") {
				onClose();
				return;
			}
			const next = nextValues(value);
			form.reset(next);
			setStart(next);
			setMode({ kind: "new" });
			fill.reset();
			setNoteOpen(false);
			setRestarts((count) => count + 1);
		},
	});

	// After "Save and add another", Amount takes focus again (BR-F03-21).
	useEffect(() => {
		if (restarts > 0) {
			formRef.current
				?.querySelector<HTMLInputElement>('input[name="amount"]')
				?.focus();
		}
	}, [restarts]);

	const clear = write.clear;

	const messageOf = (field: AnyFieldApi): string | undefined =>
		server[field.name as EntryField]
		?? (field.state.meta.errors as (string | undefined)[])[0];

	const save = (how: SaveKind) => {
		if (busy || !online) return;
		kind.current = how;
		void form.handleSubmit();
	};

	const requestClose = () => {
		if (isChanged(form.state.values, start)) setConfirming(true);
		else onClose();
	};

	// It listens before the fields' own handlers: a category tile's label takes Enter, Ctrl or
	// not, as a press of its own and stops it there.
	useShortcut(SAVE_KEY, () => save("save"), {
		enabled: isOpen && !confirming && conflict === null && !deleting,
		capture: true,
	});

	const fill = useEntryPayeeFill({
		typeNow: () => form.getFieldValue("type"),
		setType: (type) => form.setFieldValue("type", type),
		setPayee: (name) => form.setFieldValue("payee", name),
		setCategory: (category) => form.setFieldValue("category", category),
		clear,
	});

	const { minDate, maxDate } = calendarBounds(start.date, ownWindow, today);

	return (
		<>
			<Dialog
				title={title}
				size="lg"
				isOpen={isOpen}
				onOpenChange={(next) => {
					if (!next) requestClose();
				}}
				isPending={busy}
				footer={
					<>
						{editing && onDelete && (
							<Button
								variant="danger"
								isDisabled={busy}
								onPress={() => onDelete(editing, onClose)}
							>
								Delete
							</Button>
						)}
						<span className="text-caption text-ink-3 max-md:hidden">
							{shortcutLabel(SAVE_KEY)} to save
						</span>
						<span className="flex-1" />
						<Button
							variant="secondary"
							isDisabled={busy}
							onPress={requestClose}
							className="max-md:hidden"
						>
							Cancel
						</Button>
						{!editing && (
							<Button
								variant="secondary"
								isDisabled={!online || busy}
								onPress={() => save("again")}
							>
								Save and add another
							</Button>
						)}
						<Button
							isDisabled={!online}
							isPending={busy}
							onPress={() => save("save")}
						>
							Save
						</Button>
					</>
				}
			>
				<form
					ref={formRef}
					noValidate
					aria-label={title}
					className="flex flex-col gap-3.5"
					onSubmit={(event) => event.preventDefault()}
				>
					{!online && <OfflineNote>{ENTRY_TEXT.offline}</OfflineNote>}
					{failure && <FormAlert>{failure}</FormAlert>}
					{charge && editing ?
						<ChargeNotice row={editing} />
					:	<form.Field name="type">
							{(field) => (
								<Segmented
									label="Type"
									options={[...ENTRY_TYPES]}
									value={field.state.value}
									onChange={(type) =>
										fill.changeType(type as EntryType)
									}
									isDisabled={busy}
									fill
								/>
							)}
						</form.Field>
					}
					<form.Field name="amount">
						{(field) => (
							<AmountInput
								label="Amount"
								name="amount"
								autoFocus
								currency={locale.currency}
								numberLocale={locale.numberLocale}
								value={field.state.value}
								onChange={(text) => {
									field.handleChange(text);
									clear("amount");
								}}
								onBlur={() => {
									const tidy = tidyAmount(
										field.state.value,
										locale,
									);
									if (tidy !== field.state.value)
										field.handleChange(tidy);
								}}
								error={messageOf(field)}
								isDisabled={busy}
							/>
						)}
					</form.Field>
					<form.Field name="payee">
						{(field) => (
							<PayeeField
								value={field.state.value}
								onChange={(text) => {
									field.handleChange(text);
									clear("payee");
								}}
								onChoose={fill.choosePayee}
								error={messageOf(field)}
								isDisabled={busy}
							/>
						)}
					</form.Field>
					<form.Subscribe selector={(state) => state.values.type}>
						{(type) => (
							<form.Field name="category">
								{(field) => {
									const { tiles, rest } = categoryTiles(
										type,
										payees?.categories,
										field.state.value,
										fill.expanded,
									);
									return (
										<CategoryTiles
											tiles={tiles}
											rest={rest}
											isExpanded={fill.expanded}
											onExpandedChange={fill.setExpanded}
											value={field.state.value}
											onChange={(category) => {
												field.handleChange(category);
												clear("category");
												fill.forget();
											}}
											hint={fill.hint}
											error={messageOf(field)}
											isDisabled={busy}
										/>
									);
								}}
							</form.Field>
						)}
					</form.Subscribe>
					{fixed && editing ?
						<FixedDateTime
							date={formatDayHeader(start.date, {
								today,
								dateLocale: locale.dateLocale,
							})}
							time={
								charge ?
									ENTRY_TEXT.auto
								:	formatTime(editing.occurredAt, locale)
							}
						/>
					:	<div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2.5">
							<form.Field name="date">
								{(field) => (
									<DatePicker
										label="Date"
										value={field.state.value}
										onChange={(date) => {
											field.handleChange(date);
											clear("date");
										}}
										display={entryDateLabel(field.state.value, {
											today,
											dateLocale: locale.dateLocale,
										})}
										today={today}
										minValue={minDate}
										maxValue={maxDate}
										firstDayOfWeek={firstDayOfWeek}
										note={
											ownWindow ?
												editCalendarNote(ownWindow, {
													today,
													dateLocale: locale.dateLocale,
												})
											:	ENTRY_TEXT.calendarNote
										}
										hint={
											ownWindow ? undefined : (
												ENTRY_TEXT.dateHint
											)
										}
										error={messageOf(field)}
										isDisabled={busy}
									/>
								)}
							</form.Field>
							<form.Field name="time">
								{(field) => (
									<TimeField
										label="Time"
										value={field.state.value}
										onChange={(time) => {
											field.handleChange(time);
											clear("time");
										}}
										error={messageOf(field)}
										isDisabled={busy}
									/>
								)}
							</form.Field>
						</div>
					}
					<form.Field name="description">
						{(field) => (
							<TextInput
								label="Description"
								optional
								hint={ENTRY_TEXT.descriptionHint}
								counter={counterOf("description", field.state.value)}
								value={field.state.value}
								onChange={(text) => {
									field.handleChange(text);
									clear("description");
								}}
								error={messageOf(field)}
								isDisabled={busy}
							/>
						)}
					</form.Field>
					{noteOpen ?
						<form.Field name="note">
							{(field) => (
								<TextInput
									label="Note"
									optional
									multiline
									autoFocus
									hint={ENTRY_TEXT.noteHint}
									counter={counterOf("note", field.state.value)}
									value={field.state.value}
									onChange={(text) => {
										field.handleChange(text);
										clear("note");
									}}
									error={messageOf(field)}
									isDisabled={busy}
								/>
							)}
						</form.Field>
					:	<Button
							variant="ghost"
							size="sm"
							icon={Plus}
							isDisabled={busy}
							onPress={() => setNoteOpen(true)}
							className="self-start"
						>
							Add a note
						</Button>
					}
				</form>
			</Dialog>
			<DiscardDialog
				isOpen={confirming}
				onOpenChange={setConfirming}
				onDiscard={() => {
					setConfirming(false);
					onClose();
				}}
			/>
			{conflict && editing && (
				<EntryConflictDialog
					editing={editing}
					conflict={conflict}
					values={form.state.values}
					start={start}
					locale={locale}
					today={today}
					onClose={write.closeConflict}
					onKeepMine={() =>
						void entrySave.sendEdit(
							conflict.change,
							conflict.current.version,
						)
					}
					onKeepTheirs={() => write.keepTheirs(conflict.current)}
					isPending={entrySave.isEditing}
				/>
			)}
		</>
	);
}
