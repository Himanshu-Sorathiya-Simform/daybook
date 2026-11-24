import type { ExpenseCategory } from "@/lib/budgets/model";
import type { Month } from "@/lib/budgets/months";
import type { BudgetMonthAnswer } from "./types";

/** Where the device remembers List or Table (BR-F04-14). */
export const VIEW_KEY = "daybook.budgets.view";

/** The cookie that gives the server the remembered view (D-629). It sits outside the `daybook.`
 * prefix of the session cookies, which logout and expiry clear, so it is kept at logout. */
export const VIEW_COOKIE = "daybook_view_budgets";

/** The views the switch offers, List first, which is also the default. */
export const BUDGET_VIEWS = ["list", "table"] as const;

export type BudgetsView = (typeof BUDGET_VIEWS)[number];

/** Whether `category` shows anywhere in the month: as a Budget, Not budgeted or Not active. */
export function shows(view: BudgetMonthAnswer, category: ExpenseCategory): boolean {
	return [view.budgets, view.unbudgeted, view.inactive].some((group) =>
		group.some((row) => row.category === category),
	);
}

/** Whether a loaded month has no Budget, Not budgeted or Not active row: a new user's. */
export function showsNothing(view: BudgetMonthAnswer | undefined): boolean {
	return (
		view !== undefined
		&& [view.budgets, view.unbudgeted, view.inactive].every(
			(group) => group.length === 0,
		)
	);
}

/**
 * What the page has to show (F04 section 6): `offOther` is another month than the current one
 * with no connection, which is not saved on the device; `failed` a failed load, or no
 * connection with nothing saved; `isNewUser` a month with nothing to list; and `showPanel` any
 * month the panel can say something about.
 */
export function pageShape({
	isOnline,
	month,
	current,
	data,
	loadFailed,
}: {
	isOnline: boolean;
	month: Month;
	current: Month;
	data: BudgetMonthAnswer | undefined;
	loadFailed: boolean;
}): {
	offOther: boolean;
	failed: boolean;
	isNewUser: boolean;
	showPanel: boolean;
} {
	const offOther = !isOnline && month !== current;
	const failed = !data && loadFailed;
	const isNewUser = showsNothing(data);
	return {
		offOther,
		failed,
		isNewUser,
		showPanel: !offOther && !failed && !isNewUser,
	};
}
