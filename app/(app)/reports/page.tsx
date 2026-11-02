import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/app/PlaceholderPage";

export const metadata: Metadata = { title: "Reports" };

/** `/reports` until its feature is built (D-504, D-514). */
export default function ReportsPage() {
	return <PlaceholderPage name="Reports" />;
}
