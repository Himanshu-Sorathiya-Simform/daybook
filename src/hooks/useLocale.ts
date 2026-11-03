import { useSyncExternalStore } from "react";

import type { CurrencyCode } from "@/lib/currency";
import type { WeekStart } from "@/lib/geo";
import { useMe } from "./useMe";

/** How the app formats numbers, dates and times for the user (MON-4, BR-F02-18, BR-F02-19). */
export type AppLocale = {
	numberLocale: string;
	dateLocale: string;
	timezone: string;
	/** `null` before a profile exists. */
	currency: CurrencyCode | null;
	/** `null` before a profile exists. */
	weekStart: WeekStart | null;
	/** Whether these come from the profile, or from the browser before one exists. */
	fromProfile: boolean;
};

/** Before the browser is known (the server render), formats are US English in UTC. */
const FALLBACK_LANGUAGE = "en-US";

/** A language tag with Latin digits for numbers (MON-4), or the fallback's for a tag `Intl`
 * cannot read. */
export function latinDigits(language: string): string {
	try {
		return new Intl.Locale(language, { numberingSystem: "latn" }).toString();
	} catch {
		return `${FALLBACK_LANGUAGE}-u-nu-latn`;
	}
}

/** The browser's locale before a profile exists (D-508): its first preferred language, Latin
 * digits for numbers, its own time zone. */
export function browserLocale(
	language: string | undefined,
	timezone: string | undefined,
): AppLocale {
	const tag = language || FALLBACK_LANGUAGE;
	let dateLocale: string;
	try {
		dateLocale = new Intl.Locale(tag).toString();
	} catch {
		dateLocale = FALLBACK_LANGUAGE;
	}
	return {
		numberLocale: latinDigits(tag),
		dateLocale,
		timezone: timezone || "UTC",
		currency: null,
		weekStart: null,
		fromProfile: false,
	};
}

const subscribeLanguage = (onChange: () => void) => {
	window.addEventListener("languagechange", onChange);
	return () => window.removeEventListener("languagechange", onChange);
};
const readLanguage = () => navigator.languages[0] ?? navigator.language;
const readTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const noLanguage = () => undefined;
// The browser fires no event when the device's time zone changes; a reload picks it up.
const noChanges = () => () => {};

/** The user's formats: the profile's once `/api/me` has one (BR-F02-18), the browser's before
 * (MON-4, D-508). Only where a session exists, since it reads `/api/me`. */
export function useLocale(): AppLocale {
	const { data } = useMe();
	const language = useSyncExternalStore(
		subscribeLanguage,
		readLanguage,
		noLanguage,
	);
	const timezone = useSyncExternalStore(noChanges, readTimezone, noLanguage);
	const profile = data?.profile;
	if (profile) {
		return {
			numberLocale: profile.numberLocale,
			dateLocale: profile.dateLocale,
			timezone: profile.timezone,
			currency: profile.currency,
			weekStart: profile.weekStart,
			fromProfile: true,
		};
	}
	return browserLocale(language, timezone);
}
