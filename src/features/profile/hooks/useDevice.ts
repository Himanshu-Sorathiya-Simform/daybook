import { useSyncExternalStore } from "react";

import type { Device } from "../lib/onboarding";

let cached: Device | null = null;

/** The browser's zone and first language (BR-F02-03), read once per page load. */
const readDevice = (): Device =>
	(cached ??= {
		zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		language: navigator.languages[0] ?? navigator.language,
	});
const noChanges = () => () => {};
const notOnServer = () => null;

/** The browser's zone and language, or `null` while the server renders, which cannot know
 * them. */
export function useDevice(): Device | null {
	return useSyncExternalStore(noChanges, readDevice, notOnServer);
}
