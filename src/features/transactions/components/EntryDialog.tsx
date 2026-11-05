"use client";

import { type AnyFieldApi, revalidateLogic, useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { AmountInput } from "@/components/forms/AmountInput";
import { DatePicker } from "@/components/forms/DatePicker";
import { Segmented } from "@/components/forms/Segmented";
import { TextInput } from "@/components/forms/TextInput";
import { TimeField } from "@/components/forms/TimeField";
import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import { Dialog } from "@/components/surfaces/Dialog";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { useOnline } from "@/hooks/useOnline";
import { shortcutLabel, useShortcut } from "@/hooks/useShortcut";
import { formatDayHeader, formatTime } from "@/lib/date-format";
import type { WeekStart } from "@/lib/geo";
import { uuidV7 } from "@/lib/ids";
import { todayIn } from "@/lib/time";
import { categoriesFor } from "@/lib/transactions/model";
import type { TransactionEditInput } from "@/lib/transactions/schemas";
import { useCreateTransaction } from "../hooks/useCreateTransaction";
import { useEditTransaction } from "../hooks/useEditTransaction";
import type { SaveKind } from "../hooks/useEntryDialog";
import { usePayees } from "../hooks/usePayees";
import { conflictRows, keepMineLine } from "../lib/conflict";
import {
	categoryTiles,
	changedFields,
	chargeNotice,
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
	SERVER_FIELDS,
	tidyAmount,
	windowStart,
} from "../lib/entry";
import type { PayeeItem } from "../lib/suggestions";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import { refreshAfterTransactionWrite } from "../lib/refresh";
import type { TransactionAnswer } from "../lib/types";
import { readWriteError } from "../lib/write-errors";
import { CategoryTiles } from "./CategoryTiles";
import { ConflictDialog } from "./ConflictDialog";
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
	locale: EntryLocale;
	firstDayOfWeek: WeekStart;
};

type ServerMessages = Partial<Record<EntryField, string>>;

/** A 409 on an edit: the row as it is saved now, and the change that met it (BR-F03-24). */
type Conflict = { current: TransactionAnswer; change: TransactionEditInput };

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
 *   404 closes it (BR-F03-25).
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
	locale,
	firstDayOfWeek,
}: Readonly<EntryDialogProps>) {
	const online = useOnline();
	const queryClient = useQueryClient();
	const create = useCreateTransaction();
	const edit = useEditTransaction();
	const { data: payees } = usePayees();
	const [opened] = useState(() => new Date());
	const today = todayIn(locale.timezone, opened);
	// "Save and add another" on a duplicate goes on as a new Transaction.
	const [mode, setMode] = useState<EntryMode>(opening);
	const [start, setStart] = useState(() => modeValues(opening, locale, opened));
	const [server, setServer] = useState<ServerMessages>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [filledFrom, setFilledFrom] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	const [noteOpen, setNoteOpen] = useState(start.note !== "");
	const [confirming, setConfirming] = useState(false);
	const [conflict, setConflict] = useState<Conflict | null>(null);
	const [restarts, setRestarts] = useState(0);
	const formRef = useRef<HTMLFormElement>(null);
	const kind = useRef<SaveKind>("save");
	const focusInvalid = useFocusFirstInvalid(formRef);
	const busy = create.isPending || edit.isPending;
	const editing = mode.kind === "edit" ? mode.row : null;
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
			setFailure(null);
			setServer({});
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
				await sendEdit(change, editing.version);
				return;
			}
			const saving = kind.current;
			try {
				const row = await create.mutateAsync({
					body: createBody(value, checked, locale, now),
					idempotencyKey: uuidV7(),
				});
				onCreated(row, saving);
				if (saving === "save") {
					onClose();
					return;
				}
				const next = nextValues(value);
				form.reset(next);
				setStart(next);
				setMode({ kind: "new" });
				setFilledFrom(null);
				setExpanded(false);
				setNoteOpen(false);
				setRestarts((count) => count + 1);
			} catch (error) {
				refused(error);
			}
		},
	});

	/** Sends an edit at `version` (BR-F03-23): done closes the dialog, a 409 opens or refreshes
	 * the conflict view, a 404 closes it, and anything else shows in the dialog. */
	async function sendEdit(change: TransactionEditInput, version: number) {
		const row = editing!;
		try {
			const saved = await edit.mutateAsync({
				id: row.id,
				version,
				changes: change,
				idempotencyKey: uuidV7(),
			});
			setConflict(null);
			onEdited?.(saved);
			onClose();
		} catch (error) {
			const outcome = readWriteError(error, {
				mode: "edit",
				dateLocale: locale.dateLocale,
				today: todayIn(locale.timezone, new Date()),
			});
			if (outcome.kind === "conflict") {
				setConflict({ current: outcome.current, change });
				return;
			}
			setConflict(null);
			if (outcome.kind === "gone") {
				void refreshAfterTransactionWrite(queryClient, {
					kind: "delete",
					id: row.id,
				});
				onGone?.(row.id);
				onClose();
				return;
			}
			refused(error);
		}
	}

	/** Keep theirs (BR-F03-24): the change is dropped, the saved row shows everywhere, and the
	 * dialog closes. */
	const keepTheirs = (current: TransactionAnswer) => {
		setConflict(null);
		void refreshAfterTransactionWrite(queryClient, {
			kind: "edit",
			row: current,
		});
		onClose();
	};

	/** A refused save: its messages under their fields, or one line (flows 7.1 and 7.3). */
	function refused(error: unknown) {
		const outcome = readWriteError(error, {
			mode: editing ? "edit" : "create",
			dateLocale: locale.dateLocale,
			today: todayIn(locale.timezone, new Date()),
		});
		if (outcome.kind === "handled") return;
		if (outcome.kind !== "fields") {
			// A conflict without its row, or a create's 404, reads as a failed save.
			setFailure(
				outcome.kind === "form" ?
					outcome.message
				:	TRANSACTIONS_TEXT.saveFailed,
			);
			return;
		}
		const messages: ServerMessages = {};
		let line = outcome.message;
		for (const [path, text] of Object.entries(outcome.fields)) {
			const field = SERVER_FIELDS[path as keyof typeof SERVER_FIELDS];
			if (field) messages[field] ??= text;
			else line ??= text;
		}
		setServer(messages);
		setFailure(line);
		focusInvalid();
	}

	// After "Save and add another", Amount takes focus again (BR-F03-21).
	useEffect(() => {
		if (restarts > 0) {
			formRef.current
				?.querySelector<HTMLInputElement>('input[name="amount"]')
				?.focus();
		}
	}, [restarts]);

	const clear = (field: EntryField) => {
		if (server[field] === undefined) return;
		setServer((messages) => {
			const rest = { ...messages };
			delete rest[field];
			return rest;
		});
	};

	const messageOf = (field: AnyFieldApi): string | undefined =>
		server[field.name as EntryField]
		?? (field.state.meta.errors as (string | undefined)[])[0];

	const save = (how: SaveKind) => {
		if (busy || !online) return;
		kind.current = how;
		void form.handleSubmit();
	};

	const requestClose = () => {
		if (busy) return;
		if (isChanged(form.state.values, start)) setConfirming(true);
		else onClose();
	};

	useShortcut(SAVE_KEY, () => save("save"), {
		enabled: isOpen && !confirming && conflict === null,
	});

	/** A payee chosen from the list (BR-F03-45, D-89): it fills the payee, and its last category
	 * when that fits the type, replacing one already chosen. */
	const choosePayee = (item: PayeeItem) => {
		form.setFieldValue("payee", item.payee);
		clear("payee");
		const type = form.getFieldValue("type");
		if (!categoriesFor(type).includes(item.lastCategory)) return;
		form.setFieldValue("category", item.lastCategory);
		clear("category");
		setFilledFrom(item.payee);
	};

	/** A new type (BR-F03-02): moving between income and expense or refund clears the category
	 * and its hint; expense and refund share theirs. */
	const changeType = (type: EntryType) => {
		const before = form.getFieldValue("type");
		form.setFieldValue("type", type);
		if (categoriesFor(before) === categoriesFor(type)) return;
		form.setFieldValue("category", null);
		setFilledFrom(null);
		setExpanded(false);
	};

	// An edit's calendar offers the row's own window, and the stored date, which after a time
	// zone change can sit a day outside it (D-238).
	const [minDate, maxDate] =
		ownWindow ?
			[
				start.date < ownWindow.firstOn ? start.date : ownWindow.firstOn,
				start.date > ownWindow.lastOn ? start.date : ownWindow.lastOn,
			]
		:	[windowStart(today), today];

	return (
		<>
			<Dialog
				title={title}
				size="lg"
				isOpen={isOpen}
				onOpenChange={(next) => {
					if (!next) requestClose();
				}}
				isKeyboardDismissDisabled={busy}
				footer={
					<>
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
					{charge ?
						<p className="bg-soft rounded-control text-label text-ink-2 px-3 py-2.5">
							{chargeNotice(editing)}
						</p>
					:	<form.Field name="type">
							{(field) => (
								<Segmented
									label="Type"
									options={[...ENTRY_TYPES]}
									value={field.state.value}
									onChange={(type) =>
										changeType(type as EntryType)
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
								onChoose={choosePayee}
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
										expanded,
									);
									return (
										<CategoryTiles
											tiles={tiles}
											rest={rest}
											isExpanded={expanded}
											onExpandedChange={setExpanded}
											value={field.state.value}
											onChange={(category) => {
												field.handleChange(category);
												clear("category");
												setFilledFrom(null);
											}}
											hint={
												filledFrom === null ? undefined : (
													`From your last ${filledFrom} Transaction`
												)
											}
											error={messageOf(field)}
											isDisabled={busy}
										/>
									);
								}}
							</form.Field>
						)}
					</form.Subscribe>
					{fixed && editing ?
						<dl className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2.5">
							<div className="flex flex-col gap-1.25">
								<dt className="text-caption text-ink font-semibold">
									Date
								</dt>
								<dd className="text-body text-ink">
									{formatDayHeader(start.date, {
										today,
										dateLocale: locale.dateLocale,
									})}
								</dd>
							</div>
							<div className="flex flex-col gap-1.25">
								<dt className="text-caption text-ink font-semibold">
									Time
								</dt>
								<dd className="text-body text-ink">
									{charge ?
										ENTRY_TEXT.auto
									:	formatTime(editing.occurredAt, locale)}
								</dd>
							</div>
						</dl>
					:	<>
							<div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2.5">
								<form.Field name="date">
									{(field) => (
										<DatePicker
											label="Date"
											value={field.state.value}
											onChange={(date) => {
												field.handleChange(date);
												clear("date");
											}}
											display={entryDateLabel(
												field.state.value,
												{
													today,
													dateLocale: locale.dateLocale,
												},
											)}
											today={today}
											minValue={minDate}
											maxValue={maxDate}
											firstDayOfWeek={firstDayOfWeek}
											note={
												ownWindow ?
													editCalendarNote(ownWindow, {
														today,
														dateLocale:
															locale.dateLocale,
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
						</>
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
			<ConfirmDialog
				title={ENTRY_TEXT.discardTitle}
				isOpen={confirming}
				onOpenChange={setConfirming}
				confirmLabel="Discard"
				cancelLabel="Keep editing"
				onConfirm={() => {
					setConfirming(false);
					onClose();
				}}
			>
				{ENTRY_TEXT.discardBody}
			</ConfirmDialog>
			{conflict && editing && (
				<ConflictDialog
					isOpen
					onOpenChange={(next) => {
						if (!next) setConflict(null);
					}}
					rows={conflictRows(editing, conflict.change, conflict.current, {
						...locale,
						today,
					})}
					keepMineLine={keepMineLine(
						changedFields(conflict.change, form.state.values, start),
					)}
					onKeepMine={() =>
						void sendEdit(conflict.change, conflict.current.version)
					}
					onKeepTheirs={() => keepTheirs(conflict.current)}
					isPending={edit.isPending}
				/>
			)}
		</>
	);
}
