import type { ReactNode } from "react";
import { Link as AriaLink } from "react-aria-components";

import { Button } from "@/components/actions/Button";
import { cn } from "@/lib/cn";

export type LockedCardProps = {
	/** One line naming the feature, for example "See every day of spending on a calendar heat map." */
	feature: string;
	/** A static sample picture, such as `<SampleHeatmap />` or an image. Never the user's data. */
	sample: ReactNode;
	/** While offline the button reads "Connect to upgrade" and is disabled. */
	offline?: boolean;
	onUpgrade?: () => void;
	/** Where "Compare plans" goes. */
	compareHref: string;
	className?: string;
};

/**
 * The Premium locked card, shown wherever a Premium capability is not available. Exactly five
 * parts, so don't add or remove any (P4, D-119): the heading, the feature line, the sample, the
 * upgrade button and the compare link. It is the only filled section in the product, so an
 * offer never looks like the user's own data.
 */
export function LockedCard({
	feature,
	sample,
	offline = false,
	onUpgrade,
	compareHref,
	className,
}: Readonly<LockedCardProps>) {
	const upgradeProps = onUpgrade ? { onPress: onUpgrade } : {};
	return (
		<div
			className={cn(
				"rounded-card border-line bg-soft flex flex-col gap-3.5 border p-6",
				className,
			)}
		>
			<h2 className="text-heading text-ink">Part of Daybook Premium</h2>
			<p className="text-body text-ink-2">{feature}</p>
			<div
				role="img"
				aria-label="Sample picture, not your data"
			>
				{sample}
			</div>
			<div className="flex flex-wrap items-center gap-4.5">
				{offline ?
					<Button
						isDisabled
						description="You're offline."
					>
						Connect to upgrade
					</Button>
				:	<Button {...upgradeProps}>Upgrade</Button>}
				<AriaLink
					href={compareHref}
					className="text-label"
				>
					Compare plans
				</AriaLink>
			</div>
		</div>
	);
}
