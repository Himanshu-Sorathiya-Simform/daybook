"use client";

import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { FilterPopover } from "@/components/forms/FilterPopover";
import type { Group } from "@/lib/transactions/model";
import type { ListParams } from "@/lib/transactions/url";
import {
	GROUP_CHOICES,
	groupSortLabel,
	SORT_CHOICES,
	type SortChoice,
	sortChoiceOf,
	withGroup,
	withSort,
} from "../lib/group-sort";

export type GroupSortMenuProps = {
	list: ListParams;
	/** A new grouping or sort, committed at once (BR-F03-39). */
	onChange: (list: ListParams) => void;
	className?: string;
};

/**
 * The Group · Sort menu (BR-F03-39, BR-F03-40, D-529): a trigger reading "Day · Newest first"
 * that opens the groupings, then the sorts. Each choice commits at once and the menu stays
 * open, so both can be changed in one visit.
 */
export function GroupSortMenu({
	list,
	onChange,
	className,
}: Readonly<GroupSortMenuProps>) {
	return (
		<FilterPopover
			label="Group and sort"
			hideLabel
			value={groupSortLabel(list)}
			align="end"
			width="sm"
			{...(className ? { className } : {})}
		>
			<ChoiceGroup
				label="Group by"
				value={list.group}
				options={GROUP_CHOICES.map((choice) => ({
					value: choice.id,
					label: choice.label,
					...("description" in choice ?
						{ description: choice.description }
					:	{}),
				}))}
				onChange={(group) => onChange(withGroup(list, group as Group))}
			/>
			<ChoiceGroup
				label="Sort"
				value={sortChoiceOf(list).id}
				options={SORT_CHOICES.map((choice) => ({
					value: choice.id,
					label: choice.label,
				}))}
				onChange={(choice) => onChange(withSort(list, choice as SortChoice))}
				className="border-line mt-1.5 border-t pt-2"
			/>
		</FilterPopover>
	);
}
