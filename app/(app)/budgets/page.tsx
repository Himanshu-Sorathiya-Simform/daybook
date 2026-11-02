import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/app/PlaceholderPage";

export const metadata: Metadata = { title: "Budgets" };

/** `/budgets` until its feature is built (D-504, D-514). */
export default function BudgetsPage() {
	return <PlaceholderPage name="Budgets" />;
}
