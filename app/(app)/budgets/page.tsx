import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BudgetsPage } from "@/features/budgets/components/BudgetsPage";
import { budgetKeys } from "@/features/budgets/lib/keys";
import { readMonthParam } from "@/features/budgets/lib/url";
import { createQueryClient } from "@/lib/api/query-client";
import { monthOf } from "@/lib/budgets/months";
import { profileBlock } from "@/lib/profile";
import { toSearchParams } from "@/lib/search-params";
import { budgetMonth } from "@/server/dal/budgets/read";
import { requireProfile } from "@/server/dal/context";
import { readAsUser } from "@/server/dal/read";

export const metadata: Metadata = { title: "Budgets" };

/**
 * `/budgets?month=YYYY-MM` (F04 section 6, BR-F04-14): rendered on the server with the month's
 * view prefetched through the same function as `GET /api/budgets`, then hydrated, so the
 * browser asks for none of it again (STATE-5). A `month` that is invalid or outside the range
 * shows the current month here as in the browser, which then removes it from the URL with the
 * notice (D-566).
 */
export default async function Page({ searchParams }: PageProps<"/budgets">) {
	const query = toSearchParams(await searchParams);
	const queryClient = createQueryClient();
	const prefetched = await readAsUser(async (ctx, tx) => {
		if (!ctx.profile) return null;
		const profiled = requireProfile(ctx);
		const { month } = readMonthParam(query, monthOf(profiled.today));
		queryClient.setQueryData(
			budgetKeys.month(month),
			await budgetMonth(tx, profiled, month),
		);
		return { profile: profileBlock(profiled.profile), today: profiled.today };
	});
	if (!prefetched) redirect("/onboarding");

	const { profile, today } = prefetched;
	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<BudgetsPage
				locale={{
					today,
					currency: profile.currency,
					numberLocale: profile.numberLocale,
					dateLocale: profile.dateLocale,
					timezone: profile.timezone,
				}}
			/>
		</HydrationBoundary>
	);
}
