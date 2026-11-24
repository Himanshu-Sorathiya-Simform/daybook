"use client";

import {
	type AnyFieldApi,
	revalidateLogic,
	useForm,
	useSelector,
} from "@tanstack/react-form";
import { Info } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { FormNote } from "@/components/feedback/FormNote";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { AmountInput } from "@/components/forms/AmountInput";
import { CategoryTiles } from "@/components/forms/CategoryTiles";
import { Dialog } from "@/components/surfaces/Dialog";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { useOnline } from "@/hooks/useOnline";
import { formatAmountInput, parseAmount } from "@/lib/amount";
import type { ExpenseCategory } from "@/lib/budgets/model";
import { type Month, monthOf } from "@/lib/budgets/months";
import type { BudgetRecord } from "@/lib/budgets/view";
import { categoryLabel } from "@/lib/categories";
import { uuidV7 } from "@/lib/ids";
import { useBudgetHistory } from "../hooks/useBudgetHistory";
import { useBudgetPreview } from "../hooks/useBudgetPreview";
import { type BudgetDialogConflict, useBudgetSave } from "../hooks/useBudgetSave";
import { useBudgetWrite } from "../hooks/useBudgetWrite";
import {
	addCategories,
	buttonName,
	DIALOG_TEXT,
	type DialogKind,
	type DialogScope,
	dialogTitle,
	fieldMessages,
	monthLabel,
	planOf,
	recordIn,
	spentHint,
	startLimit,
	tileCaptions,
} from "../lib/dialog";
import { budgetExistsMessage } from "../lib/messages";
import type { WriteNotice } from "../lib/notices";
import type { BudgetAnswer, BudgetMonthAnswer, BudgetsLocale } from "../lib/types";
import type { BudgetField } from "../lib/write-errors";
import { BudgetChangeSummary } from "./BudgetChangeSummary";
import { DialogConflict } from "./DialogConflict";
import { ForHowLongField } from "./ForHowLongField";
import { MonthField } from "./MonthField";

export type BudgetDialogProps = {
	isOpen: boolean;
	kind: DialogKind;
	/** The category: Change limit's and Stop's, or an Add's from a Not budgeted row. */
	category: ExpenseCategory | null;
	/** The month the page shows. */
	view: BudgetMonthAnswer;
	locale: BudgetsLocale;
	onClose: () => void;
	/** "Delete Budget instead", with the Budget to delete (BR-F04-21). */
	onDeleteInstead: (record: BudgetRecord) => void;
	/** A confirmed write, with the Budget as the server saved it and the notice to show for it
	 * (BR-F04-29). */
	onSaved?: (budget: BudgetAnswer, notice: WriteNotice) => void;
};

/** What the dialog is about: its kind and the Budget record it found, which a `budget_exists`
 * refusal changes to Change limit on the existing Budget (flow 7.1). The category is a field. */
type Subject = {
	kind: DialogKind;
	/** The Budget the refusal found, ahead of the month's view. */
	found: BudgetRecord | null;
	notice: string | null;
};

/** The fields the user fills in: the form's values (D-169). The limit is the text as typed. */
type BudgetFormValues = {
	category: ExpenseCategory | null;
	amount: string;
	scope: DialogScope;
	month: Month;
};

/**
 * Add a Budget, Change limit and Stop budgeting (BR-F04-19 to BR-F04-21, BR-F04-28). Add asks
 * for a category among those with no limit in the viewed month; Add and Change limit for a
 * limit, with the category's spending in the viewed month and the one before as its hint;
 * Change limit, Stop, and Add for a category with a Budget record for how long; and each for a
 * month, which starts at the current month (BR-F04-07).
 *
 * The button names the change, and is disabled when it would change nothing, with
 * "Nothing changes." said; a stop that would remove every month turns it into "Delete Budget
 * instead" (BR-F04-21, BR-F04-27). Save checks the fields, then again on each change, and
 * sends one request with a new key per press: a `POST` for a category with no record, else a
 * `PATCH` at the record's version (D-561). A refusal keeps the dialog open with its message,
 * under a field or at the top; `budget_exists` reopens it as Change limit on the Budget found
 * (flow 7.1). Offline, Save is disabled until M5 (D-241).
 */
export function BudgetDialog({
	isOpen,
	kind: openedAs,
	category: openedWith,
	view: latest,
	locale,
	onClose,
	onDeleteInstead,
	onSaved,
}: Readonly<BudgetDialogProps>) {
	// The dialog works on the month as it was when it opened, so a refetch of the page while it
	// is open never moves the version a save is made against: another device's change then
	// meets a 409 and the conflict view, not a silent overwrite (BR-F04-23).
	const [view] = useState(latest);
	const online = useOnline();
	const current = monthOf(locale.today);
	const [subject, setSubject] = useState<Subject>({
		kind: openedAs,
		found: null,
		notice: null,
	});
	const { kind } = subject;
	const [id] = useState(() => uuidV7());
	// The fields start as the dialog opens: a Change limit on the month's limit, the rest empty.
	const [start] = useState<BudgetFormValues>(() => {
		const opened = openedWith === null ? null : recordIn(view, openedWith);
		const limit = opened && startLimit(opened, view.month, current);
		return {
			category: openedWith,
			amount:
				openedAs === "change" && limit ?
					formatAmountInput(limit, locale)
				:	"",
			scope: "onward",
			month: current,
		};
	});
	// A 409: the Budget saved now beside the user's version, with the write to resend
	// (BR-F04-23).
	const write = useBudgetWrite<BudgetDialogConflict>(onClose);
	const { failure, server, conflict } = write;
	const formRef = useRef<HTMLFormElement>(null);
	const formId = useId();
	const focusInvalid = useFocusFirstInvalid(formRef);

	const form = useForm({
		defaultValues: start,
		validationLogic: revalidateLogic(),
		validators: {
			onDynamic: ({ value }) => {
				const messages = fieldMessages(
					{
						server: {},
						kind,
						category: value.category,
						typed: parseAmount(value.amount, locale),
					},
					locale,
				);
				const fields: Partial<Record<"category" | "amount", string>> = {};
				if (messages.category) fields.category = messages.category;
				if (messages.limitMinor) fields.amount = messages.limitMinor;
				return Object.keys(fields).length > 0 ? { fields } : undefined;
			},
		},
		onSubmitInvalid: focusInvalid,
		onSubmit: ({ value }) => save(value),
	});
	const values = useSelector(form.store, (state) => state.values);
	const { category, amount, scope, month } = values;
	const record =
		subject.found ?? (category === null ? null : recordIn(view, category));
	const history = useBudgetHistory(
		kind === "stop" ? null : category,
		view.month,
		2,
	);

	const stopping = kind === "stop";
	const typed = parseAmount(amount, locale);
	/** What Save would send for `entered`, or `null` while a field cannot make one. */
	const planFor = (entered: BudgetFormValues) =>
		planOf({
			kind,
			record,
			category: entered.category,
			typed: parseAmount(entered.amount, locale),
			scope: entered.scope,
			month: entered.month,
			id,
			currency: locale.currency,
		});
	const plan = planFor(values);
	const blocked = plan?.kind === "edit" && plan.blocked;
	const unchanged = plan?.kind === "edit" && plan.unchanged;

	// What changes (BR-F04-26): the change as typed, over the Budget record if there is one, with
	// the spending of the months it lists.
	const { limit, change, preview, figures } = useBudgetPreview({
		kind,
		category,
		typed,
		scope,
		month,
		record,
		current,
	});

	/** Clears what the server said about a field once it changes. */
	const changed = write.clearField;

	const { save, submit, busy, isEditing } = useBudgetSave({
		write,
		record,
		scope,
		month,
		limit,
		locale,
		planFor,
		onClose,
		onSaved,
		onDeleteInstead,
		onExists: (found) => {
			setSubject({
				kind: "change",
				found,
				notice: budgetExistsMessage(categoryLabel(found.category)),
			});
			form.setFieldValue("scope", "onward");
		},
		onFieldsRefused: focusInvalid,
	});

	/** A field's message: the server's refusal of it, else the first of its own checks. */
	const messageOf = (field: AnyFieldApi, key: BudgetField) =>
		server[key] ?? (field.state.meta.errors as (string | undefined)[])[0];
	const title = dialogTitle(kind, category);
	return (
		<>
			<Dialog
				title={title}
				isOpen={isOpen}
				// It only ever reports closing.
				onOpenChange={onClose}
				size="lg"
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
							{DIALOG_TEXT.cancel}
						</Button>
						<Button
							variant={blocked ? "danger" : "primary"}
							isDisabled={!online || unchanged}
							isPending={busy}
							// The footer sits outside the form, so the button names it: pressing it and
							// Enter in a field both submit.
							type="submit"
							form={formId}
						>
							{blocked ?
								DIALOG_TEXT.deleteInstead
							:	buttonName(kind, scope, month, current, locale)}
						</Button>
					</>
				}
			>
				<form
					id={formId}
					ref={formRef}
					noValidate
					aria-label={title}
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						if (online && !unchanged) void form.handleSubmit();
					}}
				>
					{!online && <OfflineNote>{DIALOG_TEXT.offline}</OfflineNote>}
					{failure && <FormAlert>{failure}</FormAlert>}
					{subject.notice && (
						<FormNote icon={Info}>{subject.notice}</FormNote>
					)}
					{kind === "add" && (
						<form.Field name="category">
							{(field) => (
								<CategoryTiles
									autoFocus={openedWith === null}
									tiles={addCategories(view)}
									captions={tileCaptions(view, locale)}
									value={field.state.value}
									onChange={(next) => {
										field.handleChange(next as ExpenseCategory);
										form.setFieldValue("scope", "onward");
										changed("category");
									}}
									error={messageOf(field, "category")}
									isDisabled={busy}
								/>
							)}
						</form.Field>
					)}
					{!stopping && (
						<form.Field name="amount">
							{(field) => (
								<AmountInput
									label={
										kind === "add" ?
											DIALOG_TEXT.monthlyLimit
										:	DIALOG_TEXT.newLimit
									}
									name="limit"
									// Where the first entry is: the limit, unless an Add still needs its
									// category (BR-F04-19).
									autoFocus={kind !== "add" || openedWith !== null}
									currency={locale.currency}
									numberLocale={locale.numberLocale}
									value={field.state.value}
									onChange={(text) => {
										field.handleChange(text);
										changed("limitMinor");
									}}
									onBlur={() => {
										if (typed.ok)
											field.handleChange(
												formatAmountInput(
													typed.minor,
													locale,
												),
											);
									}}
									hint={
										history.data ?
											spentHint(history.data.months, locale)
										:	undefined
									}
									error={messageOf(field, "limitMinor")}
									isDisabled={busy}
								/>
							)}
						</form.Field>
					)}
					{/* A category with no Budget record always applies from a month (BR-F04-19,
				    D-560), and choosing one sets For how long back to that. */}
					{record && (
						<form.Field name="scope">
							{(field) => (
								<ForHowLongField
									value={field.state.value}
									onChange={field.handleChange}
									record={record}
									month={month}
									current={current}
									formats={locale}
									isDisabled={busy}
								/>
							)}
						</form.Field>
					)}
					<form.Field name="month">
						{(field) => (
							<MonthField
								label={monthLabel(kind, scope)}
								value={field.state.value}
								onChange={(next) => {
									field.handleChange(next);
									changed("month");
								}}
								current={current}
								viewed={view.month}
								formats={locale}
								isDisabled={busy}
							/>
						)}
					</form.Field>
					{server.month && <FormAlert>{server.month}</FormAlert>}
					<BudgetChangeSummary
						category={category}
						scope={scope}
						month={month}
						current={current}
						formats={locale}
						change={change}
						preview={preview}
						figures={figures}
						blocked={blocked}
						unchanged={unchanged}
					/>
				</form>
			</Dialog>
			{conflict && (
				<DialogConflict
					yours={conflict.yours}
					current={conflict.current}
					formats={locale}
					keepMineLine={conflict.line}
					isPending={isEditing}
					onClose={write.closeConflict}
					onKeepMine={() =>
						void submit(
							{
								kind: "edit",
								body: conflict.body,
								blocked: false,
								unchanged: false,
							},
							conflict.current.version,
							conflict.current,
						)
					}
					onKeepTheirs={write.keepTheirs}
				/>
			)}
		</>
	);
}
