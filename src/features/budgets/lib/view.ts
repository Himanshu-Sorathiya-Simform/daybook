/** Where the device remembers List or Table (BR-F04-14). */
export const VIEW_KEY = "daybook.budgets.view";

/** The views the switch offers, List first, which is also the default. */
export const BUDGET_VIEWS = ["list", "table"] as const;

export type BudgetsView = (typeof BUDGET_VIEWS)[number];
