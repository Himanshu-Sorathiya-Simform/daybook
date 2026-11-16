"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { FormNote } from "@/components/feedback/FormNote";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { AmountInput } from "@/components/forms/AmountInput";
import { CategoryTiles } from "@/components/forms/CategoryTiles";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { Dialog } from "@/components/surfaces/Dialog";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { useOnline } from "@/hooks/useOnline";
import { formatAmountInput, parseAmount } from "@/lib/amount";
import {
	type BudgetRules,
	type ExpenseCategory,
	setFrom,
	setMonth as setMonthLimit,
} from "@/lib/budgets/model";
import { type Month, monthOf, monthRange } from "@/lib/budgets/months";
import { type BudgetChange, previewChange } from "@/lib/budgets/preview";
import { BUDGET_MESSAGES, type BudgetEditInput } from "@/lib/budgets/schemas";
import type { BudgetRecord } from "@/lib/budgets/view";
import { categoryLabel } from "@/lib/categories";
import { uuidV7 } from "@/lib/ids";
import { useBudgetHistory } from "../hooks/useBudgetHistory";
import { useCreateBudget } from "../hooks/useCreateBudget";
import { useEditBudget } from "../hooks/useEditBudget";
import {
	addCategories,
	buttonName,
	DIALOG_TEXT,
	type DialogKind,
	type DialogPlan,
	type DialogScope,
	dialogTitle,
	limitMessage,
	monthLabel,
	nothingChanges,
	oneMonthDetail,
	planChange,
	recordIn,
	spentHint,
	startLimit,
	tileCaptions,
} from "../lib/dialog";
import { budgetExistsMessage } from "../lib/messages";
import { type Figures, historyWindow } from "../lib/preview";
import { type ConflictChange, conflictRows, keepMineLine } from "../lib/conflict";
import { type WriteNotice, writeNotice } from "../lib/notices";
import { refreshAfterBudgetWrite } from "../lib/refresh";
import type { BudgetAnswer, BudgetMonthAnswer, BudgetsLocale } from "../lib/types";
import { type BudgetField, readBudgetWriteError } from "../lib/write-errors";
import { ChangeNotes } from "./ChangeNotes";
import { ConflictDialog } from "./ConflictDialog";
import { MonthField } from "./MonthField";
import { WhatChanges } from "./WhatChanges";

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

/** What the dialog is about: its kind, category and Budget record, which a `budget_exists`
 * refusal changes to Change limit on the existing Budget (flow 7.1). */
type Subject = {
	kind: DialogKind;
	category: ExpenseCategory | null;
	/** The Budget the refusal found, ahead of the month's view. */
	found: BudgetRecord | null;
	notice: string | null;
};

const FOR_HOW_LONG: DialogScope[] = ["onward", "month"];

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
	const queryClient = useQueryClient();
	const create = useCreateBudget();
	const edit = useEditBudget();
	const current = monthOf(locale.today);
	const [subject, setSubject] = useState<Subject>({
		kind: openedAs,
		category: openedWith,
		found: null,
		notice: null,
	});
	const { kind, category } = subject;
	const record =
		subject.found ?? (category === null ? null : recordIn(view, category));
	const [id] = useState(() => uuidV7());
	const [amount, setAmount] = useState(() => {
		const start = record && startLimit(record, view.month, current);
		return kind === "change" && start ? formatAmountInput(start, locale) : "";
	});
	const [scope, setScope] = useState<DialogScope>("onward");
	const [month, setMonth] = useState<Month>(current);
	const [tried, setTried] = useState(false);
	const [server, setServer] = useState<Partial<Record<BudgetField, string>>>({});
	const [failure, setFailure] = useState<string | null>(null);
	// A 409: the Budget saved now beside the user's version, with the write to resend
	// (BR-F04-23).
	const [conflict, setConflict] = useState<{
		current: BudgetAnswer;
		body: BudgetEditInput;
		yours: BudgetRules;
		line: string;
	} | null>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const focusInvalid = useFocusFirstInvalid(formRef);
	const history = useBudgetHistory(
		kind === "stop" ? null : category,
		view.month,
		2,
	);
	const busy = create.isPending || edit.isPending;

	const stopping = kind === "stop";
	const typed = parseAmount(amount, locale);
	const messages = {
		category:
			server.category
			?? (category === null ? "Choose a category." : undefined),
		limitMinor:
			server.limitMinor
			?? (stopping ? undefined : limitMessage(typed, locale)),
		month: server.month,
	};
	const plan =
		category !== null && (stopping || typed.ok) ?
			planChange({
				kind,
				record,
				category,
				scope: scope,
				month,
				limitMinor: typed.ok ? typed.minor : 0,
				id,
				currency: locale.currency,
			})
		:	null;
	const blocked = plan?.kind === "edit" && plan.blocked;
	const unchanged = plan?.kind === "edit" && plan.unchanged;

	// What changes (BR-F04-26): the change as typed, over the Budget record if there is one, with
	// the spending of the months it lists. A category with no record always applies from a month.
	const limit =
		stopping ? null
		: typed.ok ? typed.minor
		: undefined;
	const change: BudgetChange | null =
		category !== null && limit !== undefined ?
			{
				scope: scope === "month" ? "month" : "from",
				month,
				limitMinor: limit,
			}
		:	null;
	const window =
		change && historyWindow(change, current, monthRange(current).last);
	const spending = useBudgetHistory(
		change ? category : null,
		window?.to ?? current,
		window?.months,
	);
	const figures: Figures =
		spending.data ? "ready"
		: spending.isError || spending.fetchStatus === "paused" ? "missing"
		: "loading";
	const spentIn = new Map(
		spending.data?.months.map((each) => [each.month, each.spentMinor]),
	);
	const preview =
		change
		&& previewChange({
			rules: record,
			change,
			spending: (each) => spentIn.get(each) ?? 0,
			current,
		});

	/** Clears what the server said about a field once it changes. */
	const changed = (field: BudgetField) => {
		setServer((was) => {
			const next = { ...was };
			delete next[field];
			return next;
		});
		setFailure(null);
	};

	/** Sends the write for `ready` against `version`, over the Budget as it was, `before`, for
	 * the notice's Undo. Keep mine resends it against the saved version. */
	const submit = async (
		ready: DialogPlan,
		version: number,
		before: BudgetRules | null,
	) => {
		setFailure(null);
		setServer({});
		try {
			const saved =
				ready.kind === "create" ?
					await create.mutateAsync({
						body: ready.body,
						idempotencyKey: uuidV7(),
					})
				:	await edit.mutateAsync({
						id: (record as BudgetRecord).id,
						version,
						body: ready.body,
						idempotencyKey: uuidV7(),
					});
			setConflict(null);
			onSaved?.(
				saved,
				writeNotice({
					scope,
					month,
					// A saved dialog has a valid limit, or is a stop.
					limitMinor: limit as number | null,
					before,
					saved,
					formats: locale,
				}),
			);
			onClose();
		} catch (error) {
			const outcome = readBudgetWriteError(error);
			if (outcome.kind === "conflict") {
				// Only a change on a Budget record has a version to conflict on.
				const edited = ready as Extract<DialogPlan, { kind: "edit" }>;
				const change: ConflictChange = {
					kind: "limit",
					scope,
					month,
					limitMinor: limit as number | null,
				};
				setConflict({
					current: outcome.current,
					body: edited.body,
					yours:
						scope === "month" ?
							setMonthLimit(
								record as BudgetRules,
								month,
								limit as number | null,
							)
						:	setFrom(
								record as BudgetRules,
								month,
								limit as number | null,
							),
					line: keepMineLine(change, locale),
				});
				return;
			}
			// Any other refusal closes the view and shows where the write started.
			setConflict(null);
			if (outcome.kind === "fields") {
				setServer(outcome.fields);
				setFailure(outcome.message);
				focusInvalid();
			} else if (outcome.kind === "exists") {
				setSubject({
					kind: "change",
					category: outcome.current.category,
					found: outcome.current,
					notice: budgetExistsMessage(
						categoryLabel(outcome.current.category),
					),
				});
				setScope("onward");
			} else if (outcome.kind === "gone") {
				setFailure(outcome.message);
				void refreshAfterBudgetWrite(queryClient, "count");
			} else if (outcome.kind === "form") {
				setFailure(outcome.message);
			}
		}
	};

	const save = async () => {
		setTried(true);
		// Only a stop on a Budget record can be blocked.
		if (blocked) {
			onDeleteInstead(record as BudgetRecord);
			return;
		}
		if (messages.category || messages.limitMinor) {
			focusInvalid();
			return;
		}
		// Fields without a message always make a plan; the button and Enter refuse one that
		// changes nothing.
		await submit(
			plan as DialogPlan,
			(record as BudgetRecord | null)?.version ?? 0,
			record,
		);
	};

	const shown = (field: BudgetField) => (tried ? messages[field] : server[field]);
	const title = dialogTitle(kind, category);
	return (
		<>
			<Dialog
				title={title}
				isOpen={isOpen}
				// It only ever reports closing.
				onOpenChange={onClose}
				size="lg"
				isKeyboardDismissDisabled={busy}
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
							onPress={() => void save()}
						>
							{blocked ?
								DIALOG_TEXT.deleteInstead
							:	buttonName(kind, scope, month, current, locale)}
						</Button>
					</>
				}
			>
				<form
					ref={formRef}
					noValidate
					aria-label={title}
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (online && !unchanged) void save();
					}}
				>
					{!online && <OfflineNote>{DIALOG_TEXT.offline}</OfflineNote>}
					{failure && <FormAlert>{failure}</FormAlert>}
					{subject.notice && (
						<FormNote icon={Info}>{subject.notice}</FormNote>
					)}
					{kind === "add" && (
						<CategoryTiles
							tiles={addCategories(view)}
							captions={tileCaptions(view, locale)}
							value={category}
							onChange={(next) => {
								setSubject((was) => ({
									...was,
									category: next as ExpenseCategory,
								}));
								setScope("onward");
								changed("category");
							}}
							error={shown("category")}
							isDisabled={busy}
						/>
					)}
					{!stopping && (
						<AmountInput
							label={
								kind === "add" ?
									DIALOG_TEXT.monthlyLimit
								:	DIALOG_TEXT.newLimit
							}
							name="limit"
							autoFocus={kind !== "add"}
							currency={locale.currency}
							numberLocale={locale.numberLocale}
							value={amount}
							onChange={(text) => {
								setAmount(text);
								changed("limitMinor");
							}}
							onBlur={() => {
								if (typed.ok)
									setAmount(
										formatAmountInput(typed.minor, locale),
									);
							}}
							hint={
								history.data ?
									spentHint(history.data.months, locale)
								:	undefined
							}
							error={shown("limitMinor")}
							isDisabled={busy}
						/>
					)}
					{/* A category with no Budget record always applies from a month (BR-F04-19,
				    D-560), and choosing one sets For how long back to that. */}
					{record && (
						<ChoiceGroup
							label={DIALOG_TEXT.forHowLong}
							value={scope}
							onChange={(next) => setScope(next as DialogScope)}
							options={FOR_HOW_LONG.map((value) => ({
								value,
								label:
									value === "onward" ?
										DIALOG_TEXT.onward
									:	DIALOG_TEXT.oneMonth,
								description:
									value === "onward" ?
										DIALOG_TEXT.onwardDetail
									:	oneMonthDetail(record, month, current, locale),
							}))}
							isDisabled={busy}
						/>
					)}
					<MonthField
						label={monthLabel(kind, scope)}
						value={month}
						onChange={(next) => {
							setMonth(next);
							changed("month");
						}}
						current={current}
						viewed={view.month}
						formats={locale}
						isDisabled={busy}
					/>
					{shown("month") && <FormAlert>{shown("month")}</FormAlert>}
					{change && preview && !preview.blocked && category !== null && (
						<WhatChanges
							preview={preview}
							change={change}
							context={{ category, current, formats: locale }}
							figures={figures}
						/>
					)}
					{blocked && (
						<FormAlert>
							{BUDGET_MESSAGES.stopRemovesEveryMonth}
						</FormAlert>
					)}
					{unchanged && category !== null && (
						<p className="text-body text-ink-2">
							{nothingChanges(category, scope, month, locale)}
						</p>
					)}
					{!unchanged
						&& change
						&& preview
						&& !preview.blocked
						&& category !== null && (
							<ChangeNotes
								notes={preview.notes}
								change={change}
								context={{ category, current, formats: locale }}
							/>
						)}
				</form>
			</Dialog>
			{conflict && (
				<ConflictDialog
					isOpen
					// It only ever reports closing.
					onOpenChange={() => setConflict(null)}
					rows={conflictRows(conflict.yours, conflict.current, locale)}
					keepMineLine={conflict.line}
					isPending={edit.isPending}
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
					onKeepTheirs={() => {
						setConflict(null);
						void refreshAfterBudgetWrite(queryClient, "rules");
						onClose();
					}}
				/>
			)}
		</>
	);
}
