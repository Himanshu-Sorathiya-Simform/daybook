const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * The letters for a Transaction row's avatar (F03, BR-F03-32): the first character of each of the
 * first two words, or the first two characters of a single word, in capitals. Only letters, their
 * combining marks and digits count, and a character is a whole one as the reader sees it, so an
 * accented or Indic letter is never cut in two. A payee with none gives an empty string, and the
 * row shows the category icon.
 */
export function initials(payee: string): string {
	const words = payee
		.split(/\s+/)
		.map((word) =>
			Array.from(
				graphemes.segment(word.replace(/[^\p{L}\p{M}\p{N}]/gu, "")),
				(part) => part.segment,
			),
		)
		.filter((characters) => characters.length > 0);
	const [first, second] = words;
	if (!first) return "";
	const letters = second ? [first[0], second[0]] : first.slice(0, 2);
	return letters.join("").toUpperCase();
}
