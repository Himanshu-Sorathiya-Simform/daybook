import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/AppShell";
import { FormPage } from "@/components/surfaces/FormPage";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { EntryDialogHost } from "@/features/transactions/components/EntryDialogHost";
import { profileBlock } from "@/lib/profile";
import { isRail, SIDEBAR_COOKIE } from "@/lib/sidebar";
import { readAsUser } from "@/server/dal/read";

/** The app shell around every logged-in page (root section 4, D-382), with the one entry
 * dialog its Add opens (D-548). Without a session, `readAsUser` sends the visitor to login;
 * without a profile, the page is onboarding (BR-F02-01). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
	const read = await readAsUser((ctx) =>
		ctx.profile ?
			{
				user: { name: ctx.user.name, email: ctx.user.email },
				profile: profileBlock(ctx.profile),
			}
		:	null,
	);
	if (!read) redirect("/onboarding");
	const rail = isRail((await cookies()).get(SIDEBAR_COOKIE)?.value);
	return (
		<AppShell
			user={read.user}
			dateLocale={read.profile.dateLocale}
			rail={rail}
			loggedOut={
				<FormPage title="Log in">
					<LoginForm destination="/dashboard" />
				</FormPage>
			}
		>
			<EntryDialogHost profile={read.profile}>{children}</EntryDialogHost>
		</AppShell>
	);
}
