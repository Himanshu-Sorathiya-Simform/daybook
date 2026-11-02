import { createContext, useContext } from "react";

/** The app-wide session state that `AppProviders` holds (STATE-4, D-508). */
export type AppSession = {
	/** Whether the session-expired banner shows (BR-F01-13). */
	expired: boolean;
	markExpired: () => void;
	/** A full page load of a path in the app. */
	navigate: (path: string) => void;
};

export const AppSessionContext = createContext<AppSession | null>(null);

/** The app session state; only inside `AppProviders`. */
export function useAppSession(): AppSession {
	const value = useContext(AppSessionContext);
	if (!value) throw new Error("useAppSession needs AppProviders around it");
	return value;
}
