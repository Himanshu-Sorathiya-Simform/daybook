"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/actions/Button";
import { SessionCheck } from "@/components/app/SessionCheck";
import { SessionExpiredBanner } from "@/components/app/SessionExpiredBanner";
import { FormPage } from "@/components/surfaces/FormPage";
import { useLogout } from "@/hooks/useLogout";
import { ONBOARDING_TEXT } from "../lib/messages";

export type OnboardingScreenProps = {
	/** The signed-in user's email, shown in the top bar. */
	email: string;
	/** The login screen an offline logout shows in this tab (D-502), as the app shell's does. */
	loggedOut: ReactNode;
	/** The form. */
	children: ReactNode;
};

/**
 * Onboarding's page (F02 section 6, D-511): the top bar holds the user's email and Log out,
 * the only way off a page every other page sends a user without a profile to (BR-F02-01).
 * Log out is the app's own (F01 section 2, D-502); the session check and its banner run here
 * as in the app shell, except while logging out.
 */
export function OnboardingScreen({
	email,
	loggedOut,
	children,
}: Readonly<OnboardingScreenProps>) {
	const { state, logout } = useLogout();
	if (state === "offline") return loggedOut;
	return (
		<>
			<SessionCheck />
			{state === "idle" && <SessionExpiredBanner />}
			<FormPage
				layout="wide"
				homeLink={false}
				title={ONBOARDING_TEXT.title}
				intro={ONBOARDING_TEXT.intro}
				actions={
					<>
						<span className="text-caption text-ink-2 max-w-48 min-w-0 truncate sm:max-w-80">
							{email}
						</span>
						<Button
							variant="ghost"
							isPending={state === "running"}
							onPress={() => void logout()}
						>
							{ONBOARDING_TEXT.logOut}
						</Button>
					</>
				}
			>
				{children}
			</FormPage>
		</>
	);
}
