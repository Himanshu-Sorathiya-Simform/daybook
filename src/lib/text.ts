import { z } from "zod";

/** C0 and C1 control characters (root 6.7, BR-F03-12): U+0000 to U+001F and U+007F to U+009F. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/** The same, without the line feed a note may keep. */
const CONTROL_EXCEPT_LF = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;

const INVALID = "Remove unsupported characters.";
const tooLong = (max: number) => `Use ${max} characters or fewer.`;

export type NormalizedText = { ok: true; value: string } | { ok: false };

/**
 * Text as Daybook stores it (root 6.7, BR-F03-12): trimmed and in NFC, with CRLF turned into
 * LF when `multiline`. Control characters left inside are refused; a multiline text keeps its
 * line feeds. Whitespace at the ends, line breaks included, is trimmed before the check.
 */
export function normalizeText(
	value: string,
	{ multiline = false }: { multiline?: boolean } = {},
): NormalizedText {
	const text = (multiline ? value.replace(/\r\n/g, "\n") : value)
		.trim()
		.normalize("NFC");
	const control = multiline ? CONTROL_EXCEPT_LF : CONTROL;
	return control.test(text) ? { ok: false } : { ok: true, value: text };
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
