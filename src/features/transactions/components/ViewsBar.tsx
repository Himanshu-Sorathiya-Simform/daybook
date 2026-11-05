"use client";

import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useId } from "react";
import {
	Button as AriaButton,
	ToggleButton as AriaToggleButton,
	ToggleButtonGroup as AriaToggleButtonGroup,
} from "react-aria-components";

import { Button } from "@/components/actions/Button";
import { MenuButton } from "@/components/actions/MenuButton";
import { showToast } from "@/components/feedback/showToast";
import { ConfirmDialog } from "@/components/surfaces/ConfirmDialog";
import { cn } from "@/lib/cn";
import { uuidV7 } from "@/lib/ids";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import {
	ALL_TRANSACTIONS,
	type SavedView,
	VIEW_LIMIT,
	VIEW_MESSAGES,
	viewName,
} from "@/lib/transactions/views";
import { useCreateView } from "../hooks/useCreateView";
import { useDeleteView } from "../hooks/useDeleteView";
import { useEditView } from "../hooks/useEditView";
import { useHistogram } from "../hooks/useHistogram";
import { useViews } from "../hooks/useViews";
import { activeChips } from "../lib/filter-labels";
import type { LabelLocale } from "../lib/labels";
import { deleteViewTitle, VIEW_TEXT } from "../lib/messages";
import { quickRanges } from "../lib/quick-ranges";
import {
	isUnknownView,
	selectedView,
	type UrlState,
	viewFields,
	viewUrl,
} from "../lib/saved-views";
import { readViewError } from "../lib/write-errors";
import { RenameViewDialog } from "./RenameViewDialog";

/** The selected view's dialog: Rename or the Delete confirm (BR-F03-69). */
export type ViewDialog = "rename" | "delete";

export type ViewsBarProps = {
	/** The URL's committed filter and list parameters. */
	filter: TransactionFilter;
	list: ListParams;
	/** The URL's `view`. */
	viewId: string | null;
	/** The profile's today and formats: presets resolve and chips read in them. */
	locale: LabelLocale;
	isOffline: boolean;
	/** Applies a view, `null` for All Transactions, with what it writes into the URL
	 * (BR-F03-65). */
	onApply: (id: string | null, url: UrlState) => void;
	/** Marks a view selected and leaves the filter as it is: a view just saved from it, or
	 * `null` (BR-F03-65, BR-F03-67, BR-F03-69). */
	onMark: (id: string | null) => void;
	/** The open dialog. The page keeps it, so its own keys wait while one is open. */
	dialog: ViewDialog | null;
	onDialogChange: (dialog: ViewDialog | null) => void;
	className?: string;
};

/** How many names Save as view tries when the server says each is taken (BR-F03-67). */
const NAME_TRIES = 5;

const PILL = cn(
	"text-label h-8 cursor-pointer rounded-full border px-3.25 whitespace-nowrap max-md:min-h-11",
	"transition-colors duration-(--dur-fast) ease-out",
	"border-line-strong bg-page text-ink hover:bg-soft",
	"selected:border-ink selected:bg-ink selected:text-page selected:hover:bg-ink",
);

/**
 * The saved views bar above the search box (F03 section 6, D-526): All Transactions and the
 * user's views as pills, the selected one filled, with " · edited" when the URL differs from it
 * (BR-F03-66). Choosing a pill applies its view (BR-F03-65), and pressing the selected one
 * while it is edited applies it again.
 *
 * - **Edited All Transactions:** Save as view, which names the view from the active chips,
 *   tries the next suffix when the server finds the name taken, and selects it (BR-F03-67), and
 *   Revert. At 20 views Save as view is disabled with its reason.
 * - **Edited saved view:** Update view and Revert (BR-F03-68).
 * - **Nothing edited:** "+ Save view", which only shows its hint.
 * - **A selected saved view:** a menu with Rename and Delete (BR-F03-69).
 *
 * Every write is online only: offline, they are disabled with "You are offline. Connect to
 * save." (BR-F03-63). Once the views list has loaded, a `view` it lacks leaves the URL.
 */
export function ViewsBar({
	filter,
	list,
	viewId,
	locale,
	isOffline,
	onApply,
	onMark,
	dialog,
	onDialogChange,
	className,
}: Readonly<ViewsBarProps>) {
	const views = useViews();
	const create = useCreateView();
	const edit = useEditView();
	const remove = useDeleteView();
	// The amount chip names a quick range only once the histogram has loaded (BR-F03-74).
	const histogram = useHistogram({
		filter,
		currency: locale.currency,
		enabled: false,
	});
	const noteId = useId();
	const items = views.data?.items;
	const context = { today: locale.today, currency: locale.currency };
	const current = { filter, list };
	const selected = selectedView(viewId, items, current, context);
	const saved = selected.kind === "saved" ? selected.view : null;
	const edited = selected.kind !== "waiting" && selected.edited;
	const atLimit = (items?.length ?? 0) >= VIEW_LIMIT;
	const names = items?.map((item) => item.name) ?? [];

	const unknown = isUnknownView(viewId, items);
	useEffect(() => {
		if (unknown) onMark(null);
	}, [unknown, onMark]);

	// A dialog for a view that has gone, deleted here or elsewhere, closes with it.
	const orphaned = dialog !== null && saved === null;
	useEffect(() => {
		if (orphaned) onDialogChange(null);
	}, [orphaned, onDialogChange]);

	const report = (error: unknown) => {
		const outcome = readViewError(error);
		if (outcome.kind !== "handled")
			showToast(outcome.message, { tone: "error" });
	};

	const apply = (view: SavedView | typeof ALL_TRANSACTIONS) =>
		onApply(
			view === ALL_TRANSACTIONS ? null : view.id,
			viewUrl(view, locale.today),
		);

	const saveAsView = async () => {
		const fields = viewFields(current, context);
		const quick = histogram.data ? quickRanges(histogram.data) : [];
		const chips = activeChips(filter, locale, quick).map((chip) => chip.label);
		const id = uuidV7();
		const tried: string[] = [];
		for (;;) {
			const name = viewName(chips, [...names, ...tried]);
			try {
				const view = await create.mutateAsync({
					body: { id, name, ...fields },
					idempotencyKey: uuidV7(),
				});
				onMark(view.id);
				showToast(VIEW_TEXT.saved);
				return;
			} catch (error) {
				const outcome = readViewError(error);
				tried.push(name);
				// The list on this device was stale: the next suffix may be free.
				if (outcome.kind === "name" && tried.length < NAME_TRIES) continue;
				report(error);
				return;
			}
		}
	};

	const updateView = async (view: SavedView) => {
		try {
			await edit.mutateAsync({
				id: view.id,
				version: view.version,
				changes: viewFields(current, context),
				idempotencyKey: uuidV7(),
			});
			showToast(VIEW_TEXT.updated);
		} catch (error) {
			report(error);
		}
	};

	const deleteView = async (view: SavedView) => {
		try {
			await remove.mutateAsync({
				id: view.id,
				version: view.version,
				idempotencyKey: uuidV7(),
			});
			onDialogChange(null);
			onMark(null);
			showToast(VIEW_TEXT.deleted);
		} catch (error) {
			onDialogChange(null);
			report(error);
		}
	};

	const selectedKey =
		selected.kind === "all" ? ALL_TRANSACTIONS.id : (saved?.id ?? null);
	const pills = [ALL_TRANSACTIONS, ...(items ?? [])];
	const note =
		isOffline && (edited || saved !== null) ? VIEW_TEXT.offline
		: selected.kind === "all" && edited && atLimit ? VIEW_MESSAGES.limit
		: null;
	const describedBy = note === null ? {} : { "aria-describedby": noteId };
	const busy = create.isPending || edit.isPending;

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<div className="flex flex-wrap items-center gap-1.5">
				<AriaToggleButtonGroup
					aria-label="Saved views"
					selectionMode="single"
					disallowEmptySelection
					selectedKeys={selectedKey === null ? [] : [selectedKey]}
					onSelectionChange={(keys) => {
						const key = [...keys][0];
						const view = pills.find((pill) => pill.id === key);
						// React Aria reports a press on the selected pill as choosing it again: that
						// applies the view again only when the URL has moved away from it.
						if (view && (key !== selectedKey || edited)) apply(view);
					}}
					className="flex flex-wrap items-center gap-1.5"
				>
					{pills.map((view) => (
						<AriaToggleButton
							key={view.id}
							id={view.id}
							className={PILL}
						>
							{view.name}
							{view.id === selectedKey && edited && " · edited"}
						</AriaToggleButton>
					))}
				</AriaToggleButtonGroup>
				{saved && (
					<MenuButton
						label="View options"
						icon={Ellipsis}
						hideLabel
						items={[
							{
								id: "rename",
								label: "Rename",
								icon: Pencil,
								isDisabled: isOffline,
								onAction: () => onDialogChange("rename"),
							},
							{
								id: "delete",
								label: "Delete",
								icon: Trash2,
								tone: "danger",
								isDisabled: isOffline,
								onAction: () => onDialogChange("delete"),
							},
						]}
					/>
				)}
				{edited ?
					<>
						<Button
							variant="secondary"
							size="sm"
							isDisabled={isOffline || (saved === null && atLimit)}
							isPending={busy}
							onPress={() =>
								void (saved ? updateView(saved) : saveAsView())
							}
							{...describedBy}
						>
							{saved ? "Update view" : "Save as view"}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							isDisabled={busy}
							onPress={() => apply(saved ?? ALL_TRANSACTIONS)}
						>
							Revert
						</Button>
					</>
				:	selected.kind !== "waiting" && (
						<AriaButton
							onPress={() => showToast(VIEW_TEXT.hint)}
							className={cn(
								"text-label border-edge text-ink-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-dashed bg-transparent px-3 whitespace-nowrap max-md:min-h-11",
								"hover:bg-soft transition-colors duration-(--dur-fast) ease-out",
							)}
						>
							<Plus
								aria-hidden="true"
								className="size-3.75 shrink-0"
							/>
							Save view
						</AriaButton>
					)
				}
			</div>
			{note !== null && (
				<p
					id={noteId}
					role="status"
					className="text-caption text-ink-2"
				>
					{note}
				</p>
			)}
			{saved && dialog === "rename" && (
				<RenameViewDialog
					view={saved}
					others={names.filter((name) => name !== saved.name)}
					onClose={() => onDialogChange(null)}
					isOffline={isOffline}
				/>
			)}
			{saved && (
				<ConfirmDialog
					title={deleteViewTitle(saved.name)}
					isOpen={dialog === "delete"}
					onOpenChange={(isOpen) => {
						if (!isOpen) onDialogChange(null);
					}}
					confirmLabel="Delete"
					onConfirm={() => void deleteView(saved)}
					isPending={remove.isPending}
				>
					{VIEW_TEXT.deleteBody}
				</ConfirmDialog>
			)}
		</div>
	);
}
