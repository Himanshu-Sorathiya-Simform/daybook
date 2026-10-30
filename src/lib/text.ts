import { z } from "zod";

/** C0 and C1 control characters (root 6.7, BR-F03-12): U+0000 to U+001F and U+007F to U+009F,
 * and the line and paragraph separators U+2028 and U+2029, which break a single line (D-498). */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
/** The same, without the line feed a note may keep. A note also keeps U+2028 and U+2029: it
 * holds many lines. */
const CONTROL_EXCEPT_LF = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
/** Text with nothing to see: only whitespace and default-ignorable characters, such as the
 * zero-width space, joiners, marks and variation selectors (D-498). */
const INVISIBLE_ONLY = /^[\p{Default_Ignorable_Code_Point}\s]*$/u;

const INVALID = "Remove unsupported characters.";
const tooLong = (max: number) => `Use ${max} characters or fewer.`;

export type NormalizedText = { ok: true; value: string } | { ok: false };

/**
 * Text as Daybook stores it (root 6.7, BR-F03-12): trimmed and in NFC, with CRLF turned into
 * LF when `multiline`. Control characters left inside are refused, line and paragraph
 * separators too unless `multiline`; a multiline text keeps its line feeds. A lone surrogate
 * is refused, since it is not text and Postgres refuses it in `jsonb`. Whitespace at the ends,
 * line breaks included, is trimmed before the check, and text of invisible characters only is
 * empty (D-498).
 */
export function normalizeText(
	value: string,
	{ multiline = false }: { multiline?: boolean } = {},
): NormalizedText {
	const text = (multiline ? value.replace(/\r\n/g, "\n") : value)
		.trim()
		.normalize("NFC");
	const control = multiline ? CONTROL_EXCEPT_LF : CONTROL;
	if (!text.isWellFormed() || control.test(text)) return { ok: false };
	return { ok: true, value: INVISIBLE_ONLY.test(text) ? "" : text };
}

/** Code points that Unicode 17, which Node's `toLowerCase` follows, lowercases but Postgres 18's
 * built-in tables (Unicode 16) do not: A7CE, A7D2, A7D4 and Beria Erfe, U+16EA0 to U+16EB8. */
const NOT_LOWERCASED_BY_POSTGRES = /[\ua7ce\ua7d2\ua7d4\u{16ea0}-\u{16eb8}]/u;

/**
 * `text` lowercased as Postgres's built-in `C.UTF-8` `lower()` does it, which every
 * case-insensitive match in SQL uses (D-497). It maps one code point to one, with no context.
 * JavaScript's `toLowerCase` differs: it turns `İ` into `i` and a combining dot, so a search for
 * "ist" misses "İstanbul", and it writes a capital sigma at the end of a word as `ς`, where
 * Postgres writes `σ`. A test sweeps every code point against the database, so a Postgres or
 * Node upgrade that changes either side fails there.
 */
export function lowercase(text: string): string {
	let lowered = "";
	for (const character of text) {
		if (character === "\u0130") lowered += "i";
		else if (NOT_LOWERCASED_BY_POSTGRES.test(character)) lowered += character;
		else lowered += character.toLowerCase();
	}
	return lowered;
}

/** A length in Unicode code points, as `char_length` counts in Postgres (D-230). */
export function codePointLength(value: string): number {
	return [...value].length;
}

export type TextMessages = {
	/** Shown when the text is longer than `max`. Default "Use N characters or fewer." */
	tooLong?: string;
	/** Shown for a control character. Default "Remove unsupported characters." */
	invalid?: string;
};

type TextOptions = { max: number; multiline?: boolean };

/** Normalizes and checks one text, reporting at most one issue so a field shows one message. */
function checked(
	value: string,
	{ max, multiline = false }: TextOptions,
	messages: TextMessages,
	ctx: z.RefinementCtx,
): string {
	const normalized = normalizeText(value, { multiline });
	if (!normalized.ok) {
		ctx.addIssue({ code: "custom", message: messages.invalid ?? INVALID });
		return z.NEVER;
	}
	if (codePointLength(normalized.value) > max) {
		ctx.addIssue({ code: "custom", message: messages.tooLong ?? tooLong(max) });
		return z.NEVER;
	}
	return normalized.value;
}

/** Required text of 1 to `max` code points, normalized. `required` is the field's own message
 * for an empty or missing value, such as "Enter who you paid, or who paid you." */
export function textSchema({
	messages,
	...options
}: TextOptions & { messages: TextMessages & { required: string } }) {
	return z.string({ error: messages.required }).transform((value, ctx) => {
		const text = checked(value, options, messages, ctx);
		if (text === "") {
			ctx.addIssue({ code: "custom", message: messages.required });
			return z.NEVER;
		}
		return text;
	});
}

/** Optional text of up to `max` code points. Empty, blank, null and missing all become `null`
 * (BR-F03-12). */
export function optionalTextSchema({
	messages = {},
	...options
}: TextOptions & { messages?: TextMessages }) {
	return z
		.string()
		.nullish()
		.transform((value, ctx) => {
			if (value == null) return null;
			const text = checked(value, options, messages, ctx);
			return text === "" ? null : text;
		});
}
