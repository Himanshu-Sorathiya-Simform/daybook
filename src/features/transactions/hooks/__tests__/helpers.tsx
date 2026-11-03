import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import type { SetupServer } from "msw/node";
import {
	PathnameContext,
	SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { type ReactNode, useMemo, useSyncExternalStore } from "react";
import { expect, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { createQueryClient } from "@/lib/api/query-client";

export const url = (path: string) =>
	new URL(path, window.location.origin).toString();

/** A request as a handler saw it. */
export type Seen = {
	method: string;
	path: string;
	headers: Headers;
	body: unknown;
};

/** Answers every `method` request to `path` with `respond`, and records each one. */
export function route(
	network: SetupServer,
	method: "get" | "post" | "patch" | "delete",
	path: string,
	respond: (request: Seen, index: number) => Response | Promise<Response>,
) {
	const seen: Seen[] = [];
	network.use(
		http[method](url(path), async ({ request }) => {
			const address = new URL(request.url);
			const text = method === "get" ? "" : await request.text();
			const entry: Seen = {
				method: request.method,
				path: `${address.pathname}${address.search}`,
				headers: request.headers,
				body: text === "" ? undefined : (JSON.parse(text) as unknown),
			};
			seen.push(entry);
			return respond(entry, seen.length - 1);
		}),
	);
	return seen;
}

/** The API's success envelope. */
export const ok = (data: JsonBodyType, status = 200) =>
	HttpResponse.json({ data }, { status });

/** The API's error envelope (API-9). */
export const refuse = (
	status: number,
	code: string,
	extra: {
		message?: string;
		fields?: Record<string, string>;
		details?: unknown;
	} = {},
) =>
	HttpResponse.json(
		{ error: { code, message: extra.message ?? "m", requestId: "r", ...extra } },
		{ status },
	);

/** The app's client, with its defaults, except that queries never retry, so a test sees each
 * answer once. `setDefaultOptions` replaces every default, so the others are kept by hand. */
export function testClient() {
	const queryClient = createQueryClient();
	const defaults = queryClient.getDefaultOptions();
	queryClient.setDefaultOptions({
		...defaults,
		queries: { ...defaults.queries, retry: false },
	});
	return queryClient;
}

/** Renders a hook inside the app's providers with a fresh client. */
export function renderHookInApp<Props, Result>(
	hook: (props: Props) => Result,
	options: {
		initialProps?: Props;
		queryClient?: ReturnType<typeof testClient>;
	} = {},
) {
	const queryClient = options.queryClient ?? testClient();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<AppProviders
			navigate={vi.fn()}
			queryClient={queryClient}
		>
			{children}
		</AppProviders>
	);
	const view = renderHook(hook, {
		wrapper,
		...(options.initialProps === undefined ?
			{}
		:	{ initialProps: options.initialProps }),
	});
	return { ...view, queryClient };
}

/** A history call the page made. */
export type HistoryCall = { mode: "push" | "replace"; href: string };

/**
 * Next's router seam for URL state: the search params and pathname contexts that
 * `useSearchParams` and `usePathname` read, and the browser's history calls, which Next
 * follows (its docs, "Using the native History API"). The history calls are recorded and
 * update the contexts, as Next's router would, without loading a page.
 */
export function urlHarness(start: string, pathname = "/transactions") {
	const calls: HistoryCall[] = [];
	let search = start;
	const listeners = new Set<() => void>();
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	const read = () => search;
	const record =
		(mode: HistoryCall["mode"]) =>
		(_state: unknown, _unused: string, href?: string | URL | null) => {
			const text = String(href);
			calls.push({ mode, href: text });
			search = new URL(text, window.location.origin).search;
			for (const listener of listeners) listener();
		};
	vi.spyOn(window.history, "pushState").mockImplementation(record("push"));
	vi.spyOn(window.history, "replaceState").mockImplementation(record("replace"));

	function Url({ children }: { children: ReactNode }) {
		const current = useSyncExternalStore(subscribe, read, read);
		const params = useMemo(() => new URLSearchParams(current), [current]);
		return (
			<PathnameContext value={pathname}>
				<SearchParamsContext value={params}>{children}</SearchParamsContext>
			</PathnameContext>
		);
	}

	return { calls, Url };
}

/** Waits until a mutation's rendered state shows it ended: its promise settles before React
 * renders the new status. */
export async function settled(result: { current: { status: string } }) {
	await waitFor(() =>
		expect(["success", "error"]).toContain(result.current.status),
	);
}
