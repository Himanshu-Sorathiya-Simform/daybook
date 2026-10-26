/** The supported currencies and their ISO 4217 exponents, the number of digits after the
 * decimal sign (MON-2). A test checks each against `Intl`. */
export const CURRENCY_EXPONENTS = {
	INR: 2,
	USD: 2,
	EUR: 2,
	GBP: 2,
	JPY: 0,
	KWD: 3,
} as const;

export type CurrencyCode = keyof typeof CURRENCY_EXPONENTS;

export function currencyExponent(currency: CurrencyCode): number {
	return CURRENCY_EXPONENTS[currency];
}

/** The currency's sign as the user's number format writes it, for example `₹` for INR and `€`
 * for EUR (MON-4). `numberLocale` comes from the profile, for example `de-DE-u-nu-latn`. */
export function currencySymbol(
	currency: CurrencyCode,
	numberLocale: string,
): string {
	const parts = new Intl.NumberFormat(numberLocale, {
		style: "currency",
		currency,
	}).formatToParts(0);
	return parts.find((part) => part.type === "currency")?.value ?? currency;
}
