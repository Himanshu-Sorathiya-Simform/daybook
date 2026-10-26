/** The 20 fixed categories (CAT-1 to CAT-3). The key is stable; the label is what the user sees.
 * Each category's colour is the CSS variable `--cat-<key with dashes>` in `src/styles/`. */
export const CATEGORY_LABELS = {
	food: "Food",
	shopping: "Shopping",
	transportation: "Transportation",
	utilities: "Utilities",
	entertainment: "Entertainment",
	housing: "Housing",
	health: "Health",
	education: "Education",
	travel: "Travel",
	insurance: "Insurance",
	personal_care: "Personal care",
	gifts_donations: "Gifts and donations",
	fees_taxes: "Fees and taxes",
	loans: "Loans",
	other: "Other",
	salary: "Salary",
	freelance: "Freelance",
	investments: "Investments",
	gifts: "Gifts",
	other_income: "Other income",
} as const;

export type CategoryKey = keyof typeof CATEGORY_LABELS;

export const EXPENSE_CATEGORIES = [
	"food",
	"shopping",
	"transportation",
	"utilities",
	"entertainment",
	"housing",
	"health",
	"education",
	"travel",
	"insurance",
	"personal_care",
	"gifts_donations",
	"fees_taxes",
	"loans",
	"other",
] as const satisfies readonly CategoryKey[];

export const INCOME_CATEGORIES = [
	"salary",
	"freelance",
	"investments",
	"gifts",
	"other_income",
] as const satisfies readonly CategoryKey[];

export function categoryLabel(category: CategoryKey): string {
	return CATEGORY_LABELS[category];
}

/** The CSS colour of a category, as a `var()` that follows light and dark mode. */
export function categoryColor(category: CategoryKey): string {
	return `var(--cat-${category.replaceAll("_", "-")})`;
}
