import { urlHarness as sharedUrlHarness } from "@/hooks/__tests__/helpers";

export * from "@/hooks/__tests__/helpers";

/** `urlHarness` on the Transactions page's path, unless a test gives another. */
export function urlHarness(
	start: string,
	pathname = "/transactions",
	options?: Parameters<typeof sharedUrlHarness>[2],
) {
	return sharedUrlHarness(start, pathname, options);
}
