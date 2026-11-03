import type { CurrencyCode } from "@/lib/currency";
import { defaultsFor, isZoneOf, prefill, type WeekStart } from "@/lib/geo";

/** What the onboarding form holds. `country` is `null` until it is known or chosen. */
export type OnboardingValues = {
	country: string | null;
	currency: CurrencyCode;
	timezone: string;
	weekStart: WeekStart;
};

/** The fields a country decides, and whether the user has picked each by hand (BR-F02-07). */
export type Picked = { currency: boolean; timezone: boolean; weekStart: boolean };

export type OnboardingState = { values: OnboardingValues; picked: Picked };

/** What the browser says about itself (BR-F02-03). */
export type Device = { zone: string | undefined; language: string | undefined };

const NOTHING_PICKED: Picked = {
	currency: false,
	timezone: false,
	weekStart: false,
};

/** Before a country is known, the other fields hold US defaults; they are re-derived the moment
 * a country is chosen, and Start stays disabled until then (F02 section 6). */
const NO_COUNTRY: OnboardingValues = {
	country: null,
	currency: "USD",
	timezone: "UTC",
	weekStart: "monday",
};

/** The form when the page opens (BR-F02-03 to BR-F02-06, D-208): the device's country and
 * its defaults, else an empty country. */
export function startState(device: Device): OnboardingState {
	const guess = prefill(device);
	return {
		values: guess ? { ...guess } : NO_COUNTRY,
		picked: NOTHING_PICKED,
	};
}

/**
 * A new country (BR-F02-07, D-511): the currency and week start follow it unless picked by
 * hand; the time zone follows it unless picked by hand and in the new country. A hand-picked
 * zone that is replaced counts as unpicked again, since its value is now derived.
 */
export function chooseCountry(
	state: OnboardingState,
	country: string,
	deviceZone: string | undefined,
): OnboardingState {
	const defaults = defaultsFor(country, deviceZone ?? null);
	const { values, picked } = state;
	const keepZone = picked.timezone && isZoneOf(country, values.timezone);
	return {
		values: {
			country,
			currency: picked.currency ? values.currency : defaults.currency,
			timezone: keepZone ? values.timezone : defaults.timezone,
			weekStart: picked.weekStart ? values.weekStart : defaults.weekStart,
		},
		picked: { ...picked, timezone: keepZone },
	};
}
