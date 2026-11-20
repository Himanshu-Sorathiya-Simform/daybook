import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SubscriptionsPage } from "@/features/subscriptions/components/SubscriptionsPage";
import { subscriptionKeys } from "@/features/subscriptions/lib/keys";
import { SUBSCRIPTION_VIEWS, VIEW_KEY } from "@/features/subscriptions/lib/view";
import { createQueryClient } from "@/lib/api/query-client";
import { choiceOf, isWideValue, WIDE_COOKIE } from "@/lib/device-cookies";
import { profileBlock } from "@/lib/profile";
import { requireProfile } from "@/server/dal/context";
import { readAsUser } from "@/server/dal/read";
import { listSubscriptions } from "@/server/dal/subscriptions/read";

export const metadata: Metadata = { title: "Subscriptions" };

/**
 * `/subscriptions` (F05 section 6, BR-F05-21): rendered on the server with the list prefetched
 * through the same function as `GET /api/subscriptions`, then hydrated, so the browser asks
 * for none of it again (STATE-5). The view this device remembers and its last window class
 * come from cookies, so the first draw is the right one (D-629). A user with no profile goes
 * to onboarding.
 */
export default async function Page() {
	const queryClient = createQueryClient();
	const prefetched = await readAsUser(async (ctx, tx) => {
		if (!ctx.profile) return null;
		const profiled = requireProfile(ctx);
		queryClient.setQueryData(
			subscriptionKeys.list(),
			await listSubscriptions(tx, profiled),
		);
		return { profile: profileBlock(profiled.profile), today: profiled.today };
	});
	if (!prefetched) redirect("/onboarding");

	const { profile, today } = prefetched;
	const jar = await cookies();
	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<SubscriptionsPage
				initialView={choiceOf(
					jar.get(VIEW_KEY)?.value,
					SUBSCRIPTION_VIEWS,
					"list",
				)}
				initialWide={isWideValue(jar.get(WIDE_COOKIE)?.value)}
				locale={{
					today,
					currency: profile.currency,
					numberLocale: profile.numberLocale,
					dateLocale: profile.dateLocale,
					timezone: profile.timezone,
					weekStart: profile.weekStart,
				}}
			/>
		</HydrationBoundary>
	);
}
