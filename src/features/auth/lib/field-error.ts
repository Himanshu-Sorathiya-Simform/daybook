import type { AnyFieldApi } from "@tanstack/react-form";

import type { AuthFailure, AuthField } from "./messages";

/** A field's message: the server's refusal of it, else the first of its own checks. */
export function fieldError(
	field: AnyFieldApi,
	failure: AuthFailure | null,
): string | undefined {
	if (
		failure
		&& "field" in failure
		&& failure.field === (field.name as AuthField)
	) {
		return failure.message;
	}
	const [first] = field.state.meta.errors as ({ message?: string } | undefined)[];
	return first?.message;
}
