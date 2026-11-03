import { useState } from "react";

import { useAppSession } from "@/hooks/useAppSession";
import { ApiRequestError, apiFetch } from "@/lib/api/client";
import { ONBOARDING_TEXT } from "../lib/messages";
import type { OnboardingValues } from "../lib/onboarding";

export type OnboardingField = "country" | "currency" | "timezone" | "weekStart";

export type FieldErrors = Partial<Record<OnboardingField, string>>;

/**
 * Sends onboarding's four choices (BR-F02-08) and answers what the page shows next:
 * - success opens `/transactions` with a full page load (D-241, D-510), which also reads
 *   `/api/me` afresh;
 * - a 422 gives each field its message, and asks for focus on the first;
 * - a 401 shows the session-expired banner, which `apiFetch` has already asked for (BR-F01-13);
 * - anything else gives F02's error line.
 * Every field comes from a picker, so the server's checks are the only ones that can refuse.
 * `clear` takes fields' messages away once they change.
 */
export function useOnboardingSubmit(focusInvalid: () => void) {
	const { navigate } = useAppSession();
	const [errors, setErrors] = useState<FieldErrors>({});
	const [failure, setFailure] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(
		values: OnboardingValues & { country: string },
	): Promise<void> {
		setFailure(null);
		setBusy(true);
		try {
			await apiFetch("/api/profile", { method: "POST", body: values });
		} catch (error) {
			setBusy(false);
			const fields = error instanceof ApiRequestError ? error.fields : {};
			if (Object.keys(fields).length > 0) {
				setErrors(fields as FieldErrors);
				focusInvalid();
			} else if (!(error instanceof ApiRequestError && error.status === 401)) {
				setFailure(ONBOARDING_TEXT.failed);
			}
			return;
		}
		navigate("/transactions");
	}

	function clear(...fields: OnboardingField[]): void {
		setErrors((current) => {
			const next = { ...current };
			for (const field of fields) delete next[field];
			return next;
		});
	}

	return { errors, failure, busy, submit, clear };
}
