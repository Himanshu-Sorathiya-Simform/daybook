import {
	defaultGroup,
	type Dir,
	type Group,
	type Sort,
} from "@/lib/transactions/model";
import type { ListParams } from "@/lib/transactions/url";

/** The Group · Sort menu's four sorts (BR-F03-40), each a sort and a direction (D-529). */
export const SORT_CHOICES = [
	{ id: "newest", label: "Newest first", sort: "date", dir: "desc" },
	{ id: "oldest", label: "Oldest first", sort: "date", dir: "asc" },
	{ id: "largest", label: "Largest first", sort: "amount", dir: "desc" },
	{ id: "smallest", label: "Smallest first", sort: "amount", dir: "asc" },
] as const satisfies readonly { id: string; label: string; sort: Sort; dir: Dir }[];

export type SortChoice = (typeof SORT_CHOICES)[number]["id"];

/** The menu's groupings, in BR-F03-39's order, with Day's description. */
export const GROUP_CHOICES = [
	{ id: "day", label: "Day", description: "with day totals" },
	{ id: "category", label: "Category" },
	{ id: "payee", label: "Payee" },
	{ id: "none", label: "No grouping" },
] as const satisfies readonly { id: Group; label: string; description?: string }[];

/** The sort choice that a list's sort and direction are. */
export function sortChoiceOf({ sort, dir }: Pick<ListParams, "sort" | "dir">) {
	return SORT_CHOICES.find((each) => each.sort === sort && each.dir === dir)!;
}

/** The menu trigger's text, "Day · Newest first" (BR-F03-39). */
export function groupSortLabel(list: ListParams): string {
	const group = GROUP_CHOICES.find((each) => each.id === list.group)!;
	return `${group.label} · ${sortChoiceOf(list).label}`;
}

/**
 * The list after choosing a sort (BR-F03-55, D-529). A grouping left at its sort's default
 * follows the new sort's default, so newest first by day becomes largest first with no
 * grouping and back. A chosen grouping stays, except Day, which needs the date sort and gives
 * way to no grouping.
 */
export function withSort(list: ListParams, choice: SortChoice): ListParams {
	const { sort, dir } = SORT_CHOICES.find((each) => each.id === choice)!;
	let group = list.group;
	if (group === defaultGroup(list.sort)) group = defaultGroup(sort);
	else if (group === "day" && sort === "amount") group = "none";
	return { sort, dir, group };
}

/** The list after choosing a grouping (BR-F03-55, D-529). Day needs the date sort, so choosing
 * it under an amount sort switches to the date sort in the same direction. */
export function withGroup(list: ListParams, group: Group): ListParams {
	if (group === "day" && list.sort === "amount") {
		return { sort: "date", dir: list.dir, group };
	}
	return { ...list, group };
}
