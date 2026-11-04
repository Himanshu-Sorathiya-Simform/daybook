import { type RefObject, useCallback, useEffect, useState } from "react";

/** Moves focus to the first field with a message, so a keyboard or screen reader user lands
 * on what to fix (F01, AC-F01-16). React Aria marks a radio group as a whole, so focus goes to
 * its chosen radio, or its first; a button that opens a picker, such as `DatePicker`'s, takes
 * no `aria-invalid` and is marked `data-invalid`. */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
	const field = form?.querySelector<HTMLElement>(
		'[aria-invalid="true"], button[data-invalid="true"]',
	);
	if (field?.getAttribute("role") !== "radiogroup") {
		field?.focus();
		return;
	}
	const radio =
		field.querySelector<HTMLElement>("input:checked")
		?? field.querySelector<HTMLElement>("input");
	radio?.focus();
}

/** Asks for `focusFirstInvalid` once React has drawn the messages; a field is marked invalid
 * only after the render that follows a refused submit. */
export function useFocusFirstInvalid(
	form: RefObject<HTMLFormElement | null>,
): () => void {
	const [requests, setRequests] = useState(0);
	useEffect(() => {
		if (requests > 0) focusFirstInvalid(form.current);
	}, [requests, form]);
	return useCallback(() => setRequests((count) => count + 1), []);
}
