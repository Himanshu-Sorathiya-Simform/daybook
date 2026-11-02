import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SessionCheck } from "@/components/app/SessionCheck";
import { SessionExpiredBanner } from "@/components/app/SessionExpiredBanner";
import { FormPage } from "@/components/surfaces/FormPage";
import { OnboardingForm } from "@/features/profile/components/OnboardingForm";
import { ONBOARDING_TEXT } from "@/features/profile/lib/messages";
import { readAsUser } from "@/server/dal/read";

export const metadata: Metadata = { title: ONBOARDING_TEXT.title };

/** `/onboarding` (F02 section 6). A user who already has a profile goes to `/dashboard`
 * (BR-F02-01); without a session, the proxy and `readAsUser` send the visitor to login. */
export default async function OnboardingPage() {
	const hasProfile = await readAsUser(async (ctx) => ctx.profile !== null);
	if (hasProfile) redirect("/dashboard");
	return (
		<>
			<SessionCheck />
			<SessionExpiredBanner />
			<FormPage
				title={ONBOARDING_TEXT.title}
				intro={ONBOARDING_TEXT.intro}
			>
				<OnboardingForm />
			</FormPage>
		</>
	);
}
