import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

import { createQueryClient } from "@/lib/api/query-client";
import { AppProviders } from "../AppProviders";
import type { Me } from "@/hooks/useMe";

export const url = (path: string) =>
	new URL(path, window.location.origin).toString();

/** An `/api/me` answer for `userId`, onboarded unless `profile` is `null`. */
export function meFor(
	userId: string,
	profile: Me["profile"] | null = GOLDEN_BLOCK,
): Me {
	return {
		user: { id: userId, email: `${userId}@daybook.test`, name: "Asha" },
		profile,
		plan: {
			premium: false,
			status: "none",
			source: null,
			hasBillingAccount: false,
			interval: null,
			price: null,
			currentPeriodEnd: null,
			endsAt: null,
			scheduledInterval: null,
			scheduledAt: null,
			endedAt: null,
			lapseSeenAt: null,
			duplicate: false,
		},
		goals: profile ? { lockedCount: 0, needsChoice: false } : null,
		capabilities: {},
		resolvedAt: "2026-11-02T06:30:00.000Z",
		buildId: "dev",
	};
}

export const GOLDEN_BLOCK: NonNullable<Me["profile"]> = {
	country: "IN",
	currency: "INR",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

/** Renders `ui` inside the app's providers with a fresh query client that never retries, so a
 * test sees each answer once. Answers the client, and the `navigate` spy. */
export function renderInApp(ui: ReactNode) {
	const queryClient = createQueryClient();
	queryClient.setDefaultOptions({ queries: { retry: false } });
	const navigate = vi.fn();
	const view = render(
		<AppProviders
			navigate={navigate}
			queryClient={queryClient}
		>
			{ui}
		</AppProviders>,
	);
	return { ...view, queryClient, navigate };
}
