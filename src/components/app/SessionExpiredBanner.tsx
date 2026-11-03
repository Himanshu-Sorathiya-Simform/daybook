"use client";

import { Banner } from "@/components/feedback/Banner";
import { useAppSession } from "@/hooks/useAppSession";

export const SESSION_EXPIRED_MESSAGE =
	"Your session has expired. Log in to keep saving changes.";

/** Where Log in goes: back to this page after login, with the proxy letting it through even
 * while a stale cookie remains (BR-F01-13, BR-P2-29). */
export function expiredLoginPath(
	location: Pick<Location, "pathname" | "search">,
): string {
	const next = encodeURIComponent(`${location.pathname}${location.search}`);
	return `/login?next=${next}&expired=1`;
}

/** The session-expired banner (BR-F01-13), shown after a 401 or a session check that finds no
 * session. Cached data stays on screen under it. */
export type SessionExpiredBannerProps = { className?: string };

export function SessionExpiredBanner({
	className,
}: Readonly<SessionExpiredBannerProps>) {
	const { expired, navigate } = useAppSession();
	if (!expired) return null;
	return (
		<Banner
			kind="error"
			{...(className ? { className } : {})}
			action="Log in"
			onAction={() => navigate(expiredLoginPath(window.location))}
		>
			{SESSION_EXPIRED_MESSAGE}
		</Banner>
	);
}
