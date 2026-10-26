import { currencyExponent, type CurrencyCode } from "@/lib/currency";

/** The minus sign Daybook shows (U+2212), never the hyphen. */
export const MINUS = "−";

export type SignDisplay = "negative" | "always";

export type MoneyParts = {
	/** `−`, `+` or an empty string. */
	sign: string;
	/** The currency sign, for example `₹` or `€`. */
	symbol: string;
	/** Whether the format writes the sign after the number, as `1.240,50 €` does. */
	symbolAfter: boolean;
	/** The whole part with its grouping signs, for example `1.240`. */
	integer: string;
	/** The decimal sign and the digits after it, or an empty string for JPY. */
	fraction: string;
	/** The whole amount as one string: sign, number and currency sign in the user's format. */
	text: string;
};

/** An integer in minor units as an exact decimal string, so no float ever touches it (MON-1). */
function decimalString(magnitude: number, exponent: number): `${number}` {
	const digits = String(magnitude).padStart(exponent + 1, "0");
	if (exponent === 0) return digits as `${number}`;
	return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}` as `${number}`;
}

function formatter(currency: CurrencyCode, numberLocale: string) {
	return new Intl.NumberFormat(numberLocale, { style: "currency", currency });
}

/**
 * An amount in minor units, split into the pieces a screen may style differently, and as one
 * string (MON-4). `numberLocale` comes from the profile, for example `hi-IN-u-nu-latn`. The
 * number reaches `Intl` as an exact decimal string, never through a division.
 */
export function moneyParts(
	minor: number,
	currency: CurrencyCode,
	numberLocale: string,
	{ signDisplay = "negative" }: { signDisplay?: SignDisplay } = {},
): MoneyParts {
	if (!Number.isSafeInteger(minor)) {
		throw new RangeError(
			`An amount must be a whole number of minor units, got ${minor}.`,
		);
	}
	const nf = formatter(currency, numberLocale);
	const decimal = decimalString(Math.abs(minor), currencyExponent(currency));
	const parts = nf.formatToParts(decimal);
	const join = (...types: string[]) =>
		parts
			.filter((part) => types.includes(part.type))
			.map((part) => part.value)
			.join("");
	const sign =
		minor < 0 ? MINUS
		: minor > 0 && signDisplay === "always" ? "+"
		: "";
	return {
		sign,
		symbol: join("currency"),
		symbolAfter:
			parts.findIndex((part) => part.type === "currency")
			> parts.findIndex((part) => part.type === "integer"),
		integer: join("integer", "group"),
		fraction: join("decimal", "fraction"),
		text: sign + nf.format(decimal),
	};
}

/** An amount in minor units as text in the user's format, for example `−₹18,420.00`. */
export function formatMoney(
	minor: number,
	currency: CurrencyCode,
	numberLocale: string,
	options: { signDisplay?: SignDisplay } = {},
): string {
	return moneyParts(minor, currency, numberLocale, options).text;
}

/**
 * A percentage with one decimal, computed from two integers and rounded half away from zero
 * once (MON-7, MON-8). A zero denominator gives "—".
 */
export function formatPercent(
	numerator: number,
	denominator: number,
	numberLocale: string,
	{ signDisplay = "negative" }: { signDisplay?: SignDisplay } = {},
): string {
	if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
		throw new RangeError("A percentage needs two whole numbers.");
	}
	if (denominator === 0) return "—";
	// BigInt keeps the division exact; the target is below ES2020, so no `2000n` literals.
	const [zero, two, thousand] = [BigInt(0), BigInt(2), BigInt(1000)];
	const n = BigInt(Math.abs(numerator));
	const d = BigInt(Math.abs(denominator));
	// Tenths of a percent: round(n / d * 1000), half away from zero.
	const tenths = (n * two * thousand + d) / (two * d);
	const negative = tenths > zero && numerator < 0 !== denominator < 0;
	const ratio =
		`${tenths / thousand}.${String(tenths % thousand).padStart(3, "0")}` as `${number}`;
	const text = new Intl.NumberFormat(numberLocale, {
		style: "percent",
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
		signDisplay: "never",
	}).format(ratio);
	if (negative) return MINUS + text;
	return signDisplay === "always" && tenths > zero ? "+" + text : text;
}
