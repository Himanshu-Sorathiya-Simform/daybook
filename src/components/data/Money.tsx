import { cn } from "@/lib/cn";
import type { CurrencyCode } from "@/lib/currency";
import { moneyParts, type SignDisplay } from "@/lib/money";

export type MoneyProps = {
	/** An integer amount in the currency's minor unit; negative below zero (MON-1). */
	minor: number;
	currency: CurrencyCode;
	/** The profile's number format, for example `hi-IN-u-nu-latn` (MON-4). */
	numberLocale: string;
	/** `readout` is the month's hero figure, with the sign and decimals at half size. */
	variant?: "inline" | "readout";
	/** `auto` shows a negative in red. `signed` also shows a positive in green when `sign` is
	 * `always`. `neutral` keeps the surrounding colour. */
	tone?: "auto" | "signed" | "neutral";
	/** `negative` shows only the minus; `always` shows the plus too, as Transaction rows do. */
	sign?: SignDisplay;
	className?: string;
};

/** The text colour for an amount's tone: false when the surrounding colour stays. */
function toneClass(tone: MoneyProps["tone"], minor: number, sign: SignDisplay) {
	if (tone === "neutral") return "";
	if (tone === "signed") return minor > 0 && sign === "always" && "text-pos";
	return minor < 0 && "text-neg";
}

/**
 * Every amount is shown with this component, never formatted by hand. Digits are tabular and the
 * minus is U+2212. Colour is only ever a second signal: the sign is always written.
 */
export function Money({
	minor,
	currency,
	numberLocale,
	variant = "inline",
	tone = "auto",
	sign = "negative",
	className,
}: Readonly<MoneyProps>) {
	const parts = moneyParts(minor, currency, numberLocale, { signDisplay: sign });
	const color = toneClass(tone, minor, sign);

	if (variant === "inline") {
		return (
			<span className={cn("figures whitespace-nowrap", color, className)}>
				{parts.text}
			</span>
		);
	}

	// The visual parts are hidden from screen readers, which read the whole amount once.
	const unit = cn("text-readout-unit", minor >= 0 && "text-ink-2");
	return (
		<span className={cn("inline-flex items-baseline", color, className)}>
			<span className="sr-only">{parts.text}</span>
			<span
				aria-hidden="true"
				className="figures inline-flex items-baseline"
			>
				<span className={unit}>
					{parts.sign}
					{!parts.symbolAfter && parts.symbol}
				</span>
				<span
					className={cn("text-readout", !parts.symbolAfter && "ml-0.75")}
				>
					{parts.integer}
				</span>
				<span className={unit}>
					{parts.fraction}
					{parts.symbolAfter && ` ${parts.symbol}`}
				</span>
			</span>
		</span>
	);
}
