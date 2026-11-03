import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/app/PlaceholderPage";

export const metadata: Metadata = { title: "Goals" };

/** `/goals` until its feature is built (D-504, D-514). */
export default function GoalsPage() {
	return <PlaceholderPage name="Goals" />;
}
