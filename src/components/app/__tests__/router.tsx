import {
	AppRouterContext,
	type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { ReactNode } from "react";
import { vi } from "vitest";

/** A stand-in for Next's app router, whose methods are spies. */
export function routerFake() {
	return {
		back: vi.fn(),
		forward: vi.fn(),
		refresh: vi.fn(),
		hmrRefresh: vi.fn(),
		push: vi.fn(),
		replace: vi.fn(),
		prefetch: vi.fn(),
	};
}

export type RouterFake = ReturnType<typeof routerFake>;

/** Gives `usePathname` and `useRouter` the values Next's app router would: Next's own
 * contexts, so nothing of ours is mocked. */
export function InRouter({
	pathname,
	router,
	children,
}: {
	pathname: string;
	router: RouterFake;
	children: ReactNode;
}) {
	return (
		<AppRouterContext value={router as unknown as AppRouterInstance}>
			<PathnameContext value={pathname}>{children}</PathnameContext>
		</AppRouterContext>
	);
}
