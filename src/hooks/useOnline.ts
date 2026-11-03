import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
	window.addEventListener("online", onChange);
	window.addEventListener("offline", onChange);
	return () => {
		window.removeEventListener("online", onChange);
		window.removeEventListener("offline", onChange);
	};
};
const read = () => navigator.onLine;
// The server cannot know, and a page that renders online first avoids a flash of the offline
// line for the many who are online.
const readOnServer = () => true;

/** Whether the browser says it has a connection, following `online` and `offline`. Before P1
 * (M5) this is the whole offline state for the auth screens (F01 section 6). */
export function useOnline(): boolean {
	return useSyncExternalStore(subscribe, read, readOnServer);
}
