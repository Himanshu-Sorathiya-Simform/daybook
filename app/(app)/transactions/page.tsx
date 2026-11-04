import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TransactionsPage } from "@/features/transactions/components/TransactionsPage";
import {
	transactionListOptions,
	transactionSummaryOptions,
	viewsOptions,
} from "@/features/transactions/lib/queries";
import { PAGE_BREAKDOWNS } from "@/features/transactions/lib/types";
import { createQueryClient } from "@/lib/api/query-client";
import { profileBlock } from "@/lib/profile";
import { toSearchParams } from "@/lib/search-params";
import { PAGE_SIZE } from "@/lib/transactions/model";
import { readFilterParams } from "@/lib/transactions/url";
import { requireProfile } from "@/server/dal/context";
import { readAsUser } from "@/server/dal/read";
import { viewsAnswer } from "@/server/dal/transaction-views/list";
import { listAnswer, summaryAnswer } from "@/server/dal/transactions/answers";

export const metadata: Metadata = { title: "Transactions" };

/**
 * `/transactions` (F03, BR-F03-76): rendered on the server with its first screen prefetched
 * in one read, then hydrated, so the browser asks for none of it again (STATE-5). The list's
 * first page, the summary with the panel's breakdowns, and the saved views come from the same
 * answer functions as their GET routes. Invalid parameters are dropped here as in the browser,
 * which then removes them from the URL with the notice (BR-F03-34).
 */
export default async function Page({ searchParams }: PageProps<"/transactions">) {
	const query = toSearchParams(await searchParams);
	const queryClient = createQueryClient();
	const prefetched = await readAsUser(async (ctx, tx) => {
		if (!ctx.profile) return null;
		const profiled = requireProfile(ctx);
		const { currency } = profiled.profile;
		const { filter, list } = readFilterParams(query, { currency });
		const first = await listAnswer(tx, profiled, {
			filter,
			list,
			limit: PAGE_SIZE,
			cursor: undefined,
		});
		const summary = await summaryAnswer(tx, profiled, {
			filter,
			by: PAGE_BREAKDOWNS,
		});
		const views = await viewsAnswer(tx, profiled);
		queryClient.setQueryData(
			transactionListOptions({ filter, list, currency }).queryKey,
			{ pages: [first], pageParams: [null] },
		);
		queryClient.setQueryData(
			transactionSummaryOptions({ filter, by: PAGE_BREAKDOWNS, currency })
				.queryKey,
			summary,
		);
		queryClient.setQueryData(viewsOptions().queryKey, views);
		return { profile: profileBlock(profiled.profile), today: profiled.today };
	});
	if (!prefetched) redirect("/onboarding");

	const { profile, today } = prefetched;
	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<TransactionsPage
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
