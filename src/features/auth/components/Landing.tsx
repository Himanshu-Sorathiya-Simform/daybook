import { ButtonLink } from "@/components/actions/ButtonLink";
import { Banner } from "@/components/feedback/Banner";

export const LANDING_LINE =
	"Your money, day by day. Budgets, Subscriptions, Goals and a dashboard that stays correct offline.";

export type LandingProps = {
	/** From `?deleted=1`, after an account was deleted (BR-F01-25). */
	deleted?: boolean;
};

/** The landing page for a logged-out visitor (BR-F01-27): the name, the line, Sign up and Log
 * in. The Learn posts section waits for F14 (D-503). */
export function Landing({ deleted = false }: Readonly<LandingProps>) {
	return (
		<>
			{deleted && <Banner kind="info">Your account was deleted.</Banner>}
			<main className="bg-page flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16 text-center">
				<div className="flex max-w-xl flex-col gap-3">
					<h1 className="text-readout text-ink">Daybook</h1>
					<p className="text-heading text-ink-2 font-medium">
						{LANDING_LINE}
					</p>
				</div>
				<div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
					<ButtonLink
						href="/signup"
						size="lg"
					>
						Sign up
					</ButtonLink>
					<ButtonLink
						href="/login"
						variant="secondary"
						size="lg"
					>
						Log in
					</ButtonLink>
				</div>
			</main>
		</>
	);
}
