import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/app/PlaceholderPage";

export const metadata: Metadata = { title: "Transactions" };

/** `/transactions` until its feature is built (D-504, D-514). */
export default function TransactionsPage() {
	return <PlaceholderPage name="Transactions" />;
}
