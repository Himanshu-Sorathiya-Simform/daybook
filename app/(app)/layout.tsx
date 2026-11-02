import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { FormPage } from "@/components/surfaces/FormPage";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { isRail, SIDEBAR_COOKIE } from "@/lib/sidebar";
import { readAsUser } from "@/server/dal/read";

/** The app shell around every logged-in page (root section 4, D-382). Without a session,
 * `readAsUser` sends the visitor to login; without a profile, the page is onboarding
 * (BR-F02-01). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
	const user = await readAsUser(async (ctx) =>
		ctx.profile ? { name: ctx.user.name, email: ctx.user.email } : null,
	);
	if (!user) redirect("/onboarding");
	const rail = isRail((await cookies()).get(SIDEBAR_COOKIE)?.value);
	return (
		<AppShell
			user={user}
			rail={rail}
			loggedOut={
				<FormPage title="Log in">
					<LoginForm destination="/dashboard" />
				</FormPage>
			}
		>
			{children}
		</AppShell>
	);
}
