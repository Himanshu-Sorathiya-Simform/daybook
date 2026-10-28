import { currencyExponent, maxMinor, type CurrencyCode } from "@/lib/currency";
import { moneyParts } from "@/lib/money";

// Amounts are read as text and turned into minor units by joining digit strings, never through
// a float (MON-1). An ESLint rule bans float arithmetic in this file (AC-F03-14, D-460).

export type AmountError =
	| "required"
	| "not_a_number"
	| "wrong_decimal"
	| "too_many_decimals"
	| "zero"
	| "too_large";

export type AmountResult =
	{ ok: true; minor: number } | { ok: false; error: AmountError };

/** The signs an amount may hold in a number format. `groups` are canonical: the three space
 * characters read as U+0020 and `’` as `'`. `indian` is whether the format groups as 12,34,567. */
export type NumberSigns = { decimal: string; groups: string[]; indian: boolean };

type Locale = { currency: CurrencyCode; numberLocale: string };

const DIGITS = /^[0-9]*$/;
const MAX_WHOLE_DIGITS = 9;

/** U+00A0 and U+202F read as a plain space, and `’` as `'` (BR-F03-04). */
function canonical(text: string): string {
	return text.replace(/[  ]/g, " ").replace(/’/g, "'");
}

function partsOf(format: Intl.NumberFormat, type: Intl.NumberFormatPartTypes) {
	return format
		.formatToParts("1234567.50" as `${number}`)
		.filter((part) => part.type === type)
		.map((part) => canonical(part.value));
}

const signsCache = new Map<string, NumberSigns>();

/**
 * The decimal sign and grouping signs of `numberLocale` (BR-F03-04): the decimal sign of the
 * currency format, and the grouping signs of both the currency format and the plain number
 * format (Austria has two). The decimal sign comes from a format forced to two decimals, so a
 * currency without decimals, such as JPY, still has one.
 */
export function numberSigns(
	numberLocale: string,
	currency: CurrencyCode,
): NumberSigns {
	const key = `${numberLocale}|${currency}`;
	const cached = signsCache.get(key);
	if (cached) return cached;
	const money = new Intl.NumberFormat(numberLocale, {
		style: "currency",
		currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const plain = new Intl.NumberFormat(numberLocale);
	const wholeGroups = partsOf(plain, "integer").map((digits) => digits.length);
	const signs: NumberSigns = {
		decimal: partsOf(money, "decimal")[0] ?? ".",
		groups: [
			...new Set([...partsOf(money, "group"), ...partsOf(plain, "group")]),
		],
		indian: wholeGroups.length === 3 && wholeGroups[1] === 2,
	};
	signsCache.set(key, signs);
	return signs;
}

function escape(sign: string): string {
	return sign.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `whole` is a valid grouping with `sign`: thousands, or Indian when allowed. */
function validGrouping(whole: string, sign: string, indian: boolean): boolean {
	const s = escape(sign);
	if (new RegExp(`^\\d{1,3}(?:${s}\\d{3})+$`).test(whole)) return true;
	return indian && new RegExp(`^\\d{1,2}(?:${s}\\d{2})*${s}\\d{3}$`).test(whole);
}

type Read =
	| { ok: true; whole: string; fraction: string }
	| { ok: false; error: AmountError };

/**
 * Splits canonical text into whole digits and fraction digits. The mark that is not the decimal
 * sign (`.` or `,`) is the "other mark": used outside a valid grouping, it gives `wrong_decimal`,
 * so a German user's 12.50 is never read as 1,250. Any other stray character is `not_a_number`.
 */
function readNumber(text: string, signs: NumberSigns): Read {
	const other = signs.decimal === "." ? "," : ".";
	for (const character of text) {
		if (DIGITS.test(character)) continue;
		if (character === signs.decimal || signs.groups.includes(character))
			continue;
		return {
			ok: false,
			error: character === other ? "wrong_decimal" : "not_a_number",
		};
	}
	const pieces = text.split(signs.decimal);
	if (pieces.length > 2) return { ok: false, error: "not_a_number" };
	const [whole = "", fraction = ""] = pieces;
	if (!DIGITS.test(fraction)) {
		return {
			ok: false,
			error: fraction.includes(other) ? "wrong_decimal" : "not_a_number",
		};
	}
	const used = [
		...new Set([...whole].filter((character) => !DIGITS.test(character))),
	];
	const [sign] = used;
	// A second kind of grouping sign breaks the pattern too, so one sign per amount holds (D-459).
	if (sign !== undefined && !validGrouping(whole, sign, signs.indian)) {
		return {
			ok: false,
			error: used.includes(other) ? "wrong_decimal" : "not_a_number",
		};
	}
	const digits = sign === undefined ? whole : whole.split(sign).join("");
	if (digits === "" && fraction === "")
		return { ok: false, error: "not_a_number" };
	return { ok: true, whole: digits, fraction };
}

/** Whole and fraction digits as minor units, checked against the exponent and MON-5. Nine
 * whole digits and at most `exponent` decimals can never exceed `maxMinor`. */
function toMinor(
	whole: string,
	fraction: string,
	currency: CurrencyCode,
): AmountResult {
	const exponent = currencyExponent(currency);
	if (fraction.length > exponent) return { ok: false, error: "too_many_decimals" };
	const significant = whole.replace(/^0+/, "");
	if (significant.length > MAX_WHOLE_DIGITS)
		return { ok: false, error: "too_large" };
	const minor =
		Number.parseInt(`${significant}${fraction.padEnd(exponent, "0")}`, 10) || 0;
	if (minor === 0) return { ok: false, error: "zero" };
	return { ok: true, minor };
}

/**
 * The entry field's amount, typed in the user's own format (BR-F03-04, D-230): digits, the
 * decimal sign once, and grouping signs only inside a valid thousands grouping, or an Indian
 * one where the format groups that way. One grouping sign per amount (D-459).
 */
export function parseAmount(
	text: string,
	{ currency, numberLocale }: Locale,
): AmountResult {
	const trimmed = canonical(text).trim();
	if (trimmed === "") return { ok: false, error: "required" };
	const read = readNumber(trimmed, numberSigns(numberLocale, currency));
	if (!read.ok) {
		// Yen has no decimals, so a misplaced mark is best explained as decimals.
		const noDecimals =
			read.error === "wrong_decimal" && currencyExponent(currency) === 0;
		return { ok: false, error: noDecimals ? "too_many_decimals" : read.error };
	}
	return toMinor(read.whole, read.fraction, currency);
}

/** Minor units from a whole part and a decimal part given as digit strings. */
function minorOf(whole: string, fraction: string, currency: CurrencyCode): number {
	const exponent = currencyExponent(currency);
	return Number.parseInt(
		`${whole}${fraction.padEnd(exponent, "0").slice(0, exponent)}`,
		10,
	);
}

/** The amount as the field shows it after blur: the user's grouping and decimals, no currency
 * sign, for example `1,23,456.50` or `1.240,50`. */
export function formatAmountInput(
	minor: number,
	{ currency, numberLocale }: Locale,
): string {
	const parts = moneyParts(minor, currency, numberLocale);
	return `${parts.integer}${parts.fraction}`;
}

/** The message F03 section 8 shows for an amount error, with examples in the user's format. */
export function amountMessage(error: AmountError, locale: Locale): string {
	const { currency, numberLocale } = locale;
	switch (error) {
		case "required":
			return "Enter an amount.";
		case "not_a_number":
			return `Enter a number, like ${formatAmountInput(minorOf("1240", "50", currency), locale)}.`;
		case "wrong_decimal": {
			const { decimal } = numberSigns(numberLocale, currency);
			return `Use ${decimal} for decimals, like ${formatAmountInput(minorOf("12", "50", currency), locale)}.`;
		}
		case "too_many_decimals": {
			const exponent = currencyExponent(currency);
			// JPY is the one supported currency without decimals (MON-2).
			return exponent === 0 ?
					"Yen amounts have no decimals."
				:	`Use at most ${exponent} decimal places.`;
		}
		case "zero":
			return "Enter an amount above zero.";
		case "too_large":
			return `The largest amount is ${formatAmountInput(maxMinor(currency), locale)}.`;
	}
}

const URL_AMOUNT = /^([0-9]+)(?:\.([0-9]+))?$/;

/** `min` or `max` from the URL: major units with `.`, no grouping (root 6.9, BR-F03-36). `null`
 * when it does not parse, has too many decimals, is zero or exceeds MON-5 (BR-F03-34). */
export function parseUrlAmount(text: string, currency: CurrencyCode): number | null {
	const match = URL_AMOUNT.exec(text);
	if (!match) return null;
	const result = toMinor(String(match[1]), match[2] ?? "", currency);
	return result.ok ? result.minor : null;
}

/** Minor units as a URL amount with the currency's full decimals: `1500.00`, `1500` for JPY,
 * `1.250` for KWD, so equal amounts always write the same URL (D-458). */
export function writeUrlAmount(minor: number, currency: CurrencyCode): string {
	const exponent = currencyExponent(currency);
	const digits = String(minor).padStart(exponent + 1, "0");
	if (exponent === 0) return digits;
	return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/** Search uses one fixed shape: `.` decimal, `,` grouping, thousands or Indian (BR-F03-35). */
const QUERY_SIGNS: NumberSigns = { decimal: ".", groups: [","], indian: true };

/** The amount a numeric search means, or `null` when `q` is text (BR-F03-35). A numeric `q` is
 * one the amount field would accept, so zero and amounts above MON-5 count as text. */
export function parseNumericQuery(q: string, currency: CurrencyCode): number | null {
	const read = readNumber(q, QUERY_SIGNS);
	if (!read.ok) return null;
	const result = toMinor(read.whole, read.fraction, currency);
	return result.ok ? result.minor : null;
}
