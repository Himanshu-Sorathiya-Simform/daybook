import { ButtonLink } from "@/components/actions/ButtonLink";
import { Banner } from "@/components/feedback/Banner";

export const LANDING_LINE =
	"Your money, day by day. Budgets, Subscriptions, Goals and a dashboard that stays correct offline.";

export type LandingProps = {
	/** From `?deleted=1`, after an account was deleted (BR-F01-25). */
	deleted?: boolean;
};

/** The landing page for a logged-out visitor (BR-F01-27): the name, the line, Sign up and Log
 * in, left-aligned on a wide column. The Learn posts section waits for F14 (D-503). */
export function Landing({ deleted = false }: Readonly<LandingProps>) {
	return (
		<>
			{deleted && <Banner kind="info">Your account was deleted.</Banner>}
			<main className="bg-page flex min-h-dvh justify-center px-4 pt-24 pb-16 md:px-8 md:pt-36">
				<div className="flex w-full max-w-240 flex-col gap-8">
					<div className="flex flex-col gap-4">
						<h1 className="text-readout text-ink font-bold tracking-tight">
							Daybook
						</h1>
						<p className="text-heading text-ink-2 max-w-md font-normal">
							{LANDING_LINE}
						</p>
					</div>
					<div className="flex flex-wrap gap-2.5">
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
				</div>
			</main>
		</>
	);
}
