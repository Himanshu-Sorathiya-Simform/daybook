import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FormPage } from "@/components/surfaces/FormPage";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { OnboardingForm } from "@/features/profile/components/OnboardingForm";
import { OnboardingScreen } from "@/features/profile/components/OnboardingScreen";
import { ONBOARDING_TEXT } from "@/features/profile/lib/messages";
import { readAsUser } from "@/server/dal/read";

export const metadata: Metadata = { title: ONBOARDING_TEXT.title };

/** `/onboarding` (F02 section 6). A user who already has a profile goes to `/dashboard`
 * (BR-F02-01); without a session, the proxy and `readAsUser` send the visitor to login. */
export default async function OnboardingPage() {
	const email = await readAsUser((ctx) => (ctx.profile ? null : ctx.user.email));
	if (email === null) redirect("/dashboard");
	return (
		<OnboardingScreen
			email={email}
			loggedOut={
				<FormPage title="Log in">
					<LoginForm destination="/dashboard" />
				</FormPage>
			}
		>
			<OnboardingForm />
		</OnboardingScreen>
	);
}
