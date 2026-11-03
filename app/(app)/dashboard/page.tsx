import { redirect } from "next/navigation";

/** `/dashboard` opens Transactions until the dashboard arrives (M3, D-241). */
export default function DashboardPage() {
	redirect("/transactions");
}
