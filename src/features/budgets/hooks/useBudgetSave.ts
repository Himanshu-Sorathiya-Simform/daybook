import type { BudgetRules } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import type { BudgetEditInput } from "@/lib/budgets/schemas";
import type { BudgetRecord } from "@/lib/budgets/view";
import { uuidV7 } from "@/lib/ids";
import { type ConflictChange, keepMineLine } from "../lib/conflict";
import { type DialogPlan, type DialogScope, rulesAfter } from "../lib/dialog";
import { type WriteNotice, writeNotice } from "../lib/notices";
import type { BudgetAnswer, BudgetsLocale } from "../lib/types";
import { useBudgetWrite } from "./useBudgetWrite";
import { useCreateBudget } from "./useCreateBudget";
import { useEditBudget } from "./useEditBudget";

/** A 409 in the dialog: the Budget saved now beside the user's version, with the write to
 * resend (BR-F04-23). */
export type BudgetDialogConflict = {
	current: BudgetAnswer;
	body: BudgetEditInput;
	yours: BudgetRules;
	line: string;
};

export type BudgetSaveOptions<Entered> = {
	write: ReturnType<typeof useBudgetWrite<BudgetDialogConflict>>;
	/** The Budget record the write is over, or `null` for a category with none. */
	record: BudgetRecord | null;
	scope: DialogScope;
	month: Month;
	/** The new limit: `null` for a stop. */
	limit: number | null | undefined;
	locale: BudgetsLocale;
	/** What Save would send for these values, or `null` while a field cannot make one. */
	planFor: (entered: Entered) => DialogPlan | null;
	onClose: () => void;
	onSaved?: ((budget: BudgetAnswer, notice: WriteNotice) => void) | undefined;
	/** "Delete Budget instead": a stop that would remove every month (BR-F04-21). */
	onDeleteInstead: (record: BudgetRecord) => void;
	/** `budget_exists` on an Add: the dialog reopens as Change limit on the Budget found. */
	onExists: (found: BudgetRecord) => void;
	/** A refusal named fields: the dialog moves focus to the first. */
	onFieldsRefused: () => void;
};

/**
 * Save in the Budget dialog (BR-F04-19 to BR-F04-21, D-561): a `POST` for a category with no
 * record, else a `PATCH` at the record's version, with a new key per press and one write at a
 * time. `submit` sends a plan against `version`, over the Budget as it was, `before`, for the
 * notice's Undo; Keep mine resends it against the saved version. A refusal goes to `write`.
 */
export function useBudgetSave<Entered>({
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
	onExists,
	onFieldsRefused,
}: BudgetSaveOptions<Entered>) {
	const create = useCreateBudget();
	const edit = useEditBudget();

	const submit = async (
		ready: DialogPlan,
		version: number,
		before: BudgetRules | null,
	) => {
		// A second press, Enter included, sends nothing while a write is out (D-575, D-615).
		const request = write.sending.run(() =>
			ready.kind === "create" ?
				create.mutateAsync({
					body: ready.body,
					idempotencyKey: uuidV7(),
				})
			:	edit.mutateAsync({
					id: (record as BudgetRecord).id,
					version,
					body: ready.body,
					idempotencyKey: uuidV7(),
				}),
		);
		if (request === null) return;
		write.reset();
		try {
			const saved = await request;
			write.setConflict(null);
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
			await write.refuse(error, {
				// Only a change on a Budget record has a version to conflict on.
				conflictOf: (current) => {
					const edited = ready as Extract<DialogPlan, { kind: "edit" }>;
					const change: ConflictChange = {
						kind: "limit",
						scope,
						month,
						limitMinor: limit as number | null,
					};
					return {
						current,
						body: edited.body,
						yours: rulesAfter(record as BudgetRules, change),
						line: keepMineLine(change, locale),
					};
				},
				onExists,
				onFields: onFieldsRefused,
			});
		}
	};

	/** Save, once the fields check out. */
	const save = async (entered: Entered) => {
		const planned = planFor(entered);
		// Only a stop on a Budget record can be blocked.
		if (planned?.kind === "edit" && planned.blocked) {
			onDeleteInstead(record as BudgetRecord);
			return;
		}
		// Fields without a message always make a plan; the button and Enter refuse one that
		// changes nothing.
		await submit(
			planned as DialogPlan,
			(record as BudgetRecord | null)?.version ?? 0,
			record,
		);
	};

	return {
		save,
		submit,
		/** A write is out: the choices wait. */
		busy: create.isPending || edit.isPending,
		/** An edit is out: the conflict view's pending state. */
		isEditing: edit.isPending,
	};
}
