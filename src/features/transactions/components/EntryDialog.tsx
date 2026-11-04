"use client";

import { type AnyFieldApi, revalidateLogic, useForm } from "@tanstack/react-form";
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
import type { WeekStart } from "@/lib/geo";
import { uuidV7 } from "@/lib/ids";
import { todayIn } from "@/lib/time";
import { categoriesFor } from "@/lib/transactions/model";
import { useCreateTransaction } from "../hooks/useCreateTransaction";
import type { SaveKind } from "../hooks/useEntryDialog";
import { usePayees } from "../hooks/usePayees";
import {
	categoryTiles,
	checkEntry,
	counterOf,
	createBody,
	ENTRY_TEXT,
	ENTRY_TYPES,
	type EntryField,
	type EntryLocale,
	type EntryType,
	entryDateLabel,
	isChanged,
	nextValues,
	SERVER_FIELDS,
	startValues,
	tidyAmount,
	windowStart,
} from "../lib/entry";
import type { PayeeItem } from "../lib/suggestions";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import type { TransactionAnswer } from "../lib/types";
import { readWriteError } from "../lib/write-errors";
import { CategoryTiles } from "./CategoryTiles";
import { PayeeField } from "./PayeeField";

export type EntryDialogProps = {
	isOpen: boolean;
	/** Closes it; it never closes itself while a save runs. */
	onClose: () => void;
	/** A create was confirmed (BR-F03-21, D-548). */
	onCreated: (row: TransactionAnswer, kind: SaveKind) => void;
	locale: EntryLocale;
	firstDayOfWeek: WeekStart;
};

type ServerMessages = Partial<Record<EntryField, string>>;

/** Saves from anywhere in the dialog, text fields included (BR-F03-52). */
const SAVE_KEY = "Mod+Enter";

/**
 * The entry dialog for a new Transaction (BR-F03-48, BR-F03-75, BR-F03-77): Type, Amount
 * (focused), Payee, Category, Date and Time, Description, and Note behind "Add a note". A bottom
 * sheet below 768 px. Its values start when it opens: an expense, today and now in the profile
 * zone (BR-F03-07), and the date can be today or one of the 10 days before (BR-F03-08).
 *
 * Save checks every field, then on each change (as F01's forms do), and sends one create with a
 * new key per press (BR-F03-20). A refusal keeps the dialog open: field messages go under their
 * fields with focus on the first, anything else is one line at the top (flow 7.1). Offline, Save
 * is disabled until M5 (D-241). Ctrl or Cmd+Enter saves, and closing with changes asks first
 * (BR-F03-49).
 */
export function EntryDialog({
	isOpen,
	onClose,
	onCreated,
	locale,
	firstDayOfWeek,
}: Readonly<EntryDialogProps>) {
	const online = useOnline();
	const create = useCreateTransaction();
	const { data: payees } = usePayees();
	const [opened] = useState(() => new Date());
	const today = todayIn(locale.timezone, opened);
	const [start, setStart] = useState(() => startValues(locale.timezone, opened));
	const [server, setServer] = useState<ServerMessages>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [filledFrom, setFilledFrom] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	const [noteOpen, setNoteOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [restarts, setRestarts] = useState(0);
	const formRef = useRef<HTMLFormElement>(null);
	const kind = useRef<SaveKind>("save");
	const focusInvalid = useFocusFirstInvalid(formRef);
	const busy = create.isPending;

	const form = useForm({
		defaultValues: start,
		validationLogic: revalidateLogic(),
		validators: {
			onDynamic: ({ value }) => {
				const checked = checkEntry(value, locale, new Date());
				return checked.ok ? undefined : { fields: checked.fields };
			},
		},
		onSubmitInvalid: focusInvalid,
		onSubmit: async ({ value }) => {
			const now = new Date();
			const checked = checkEntry(value, locale, now);
			if (!checked.ok) return;
			const saving = kind.current;
			setFailure(null);
			setServer({});
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
				setFilledFrom(null);
				setExpanded(false);
				setNoteOpen(false);
				setRestarts((count) => count + 1);
			} catch (error) {
				refused(error);
			}
		},
	});

	/** A refused create: its messages under their fields, or one line (flow 7.1). */
	function refused(error: unknown) {
		const outcome = readWriteError(error, {
			mode: "create",
			dateLocale: locale.dateLocale,
			today,
		});
		if (outcome.kind === "handled") return;
		if (outcome.kind !== "fields") {
			// A create has no conflict and no row to lose, so those read as a failed save.
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
		enabled: isOpen && !confirming,
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

	return (
		<>
			<Dialog
				title={ENTRY_TEXT.newTitle}
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
						<Button
							variant="secondary"
							isDisabled={!online || busy}
							onPress={() => save("again")}
						>
							Save and add another
						</Button>
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
					aria-label={ENTRY_TEXT.newTitle}
					className="flex flex-col gap-3.5"
					onSubmit={(event) => event.preventDefault()}
				>
					{!online && <OfflineNote>{ENTRY_TEXT.offline}</OfflineNote>}
					{failure && <FormAlert>{failure}</FormAlert>}
					<form.Field name="type">
						{(field) => (
							<Segmented
								label="Type"
								options={[...ENTRY_TYPES]}
								value={field.state.value}
								onChange={(type) => changeType(type as EntryType)}
								isDisabled={busy}
								fill
							/>
						)}
					</form.Field>
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
									display={entryDateLabel(field.state.value, {
										today,
										dateLocale: locale.dateLocale,
									})}
									today={today}
									minValue={windowStart(today)}
									maxValue={today}
									firstDayOfWeek={firstDayOfWeek}
									note={ENTRY_TEXT.calendarNote}
									hint={ENTRY_TEXT.dateHint}
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
		</>
	);
}
