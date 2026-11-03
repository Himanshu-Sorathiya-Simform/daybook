/** Compares two strings by UTF-16 code unit, which is what a bare `sort()` does. Use it for
 * identifiers whose order must never vary with the locale or the ICU version (country codes,
 * zone names, variable names, URL values). It is not an alphabetical order for people:
 * "Zebra" comes before "apple", and `_` comes after the capitals. For text a person reads,
 * use `Intl.Collator`. */
export function compareCodeUnits(a: string, b: string): number {
	if (a < b) return -1;
	return a > b ? 1 : 0;
}
