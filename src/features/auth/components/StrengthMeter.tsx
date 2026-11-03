"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { loadScorer, type StrengthLabel, strengthLabel } from "../lib/strength";

const LEVELS: Record<StrengthLabel, { filled: number; tone: string }> = {
	Weak: { filled: 1, tone: "bg-neg" },
	Fair: { filled: 2, tone: "bg-accent" },
	Good: { filled: 3, tone: "bg-accent" },
	Strong: { filled: 4, tone: "bg-pos" },
};

export type StrengthMeterProps = {
	password: string;
	/** The email and name typed so far, which count against the password (D-509). */
	userInputs: string[];
	className?: string;
};

/** The advisory password strength meter (BR-F01-04, D-186, D-509): four bars and a word,
 * announced politely as it changes. It never blocks submission, and shows nothing while the
 * password is empty or while zxcvbn-ts is still loading. */
export function StrengthMeter({
	password,
	userInputs,
	className,
}: Readonly<StrengthMeterProps>) {
	const [scored, setScored] = useState<{
		for: string;
		label: StrengthLabel;
	} | null>(null);
	const inputs = userInputs.join("\n");

	useEffect(() => {
		if (!password) return;
		let current = true;
		loadScorer()
			.then((score) => {
				if (current) {
					setScored({
						for: password,
						label: strengthLabel(score(password, inputs.split("\n"))),
					});
				}
			})
			// The meter is advice; without zxcvbn-ts the form works the same.
			.catch(() => undefined);
		return () => {
			current = false;
		};
	}, [password, inputs]);

	const label = password && scored?.for === password ? scored.label : null;
	return (
		<div
			className={cn("flex items-center gap-2.5", className)}
			aria-live="polite"
		>
			{label && (
				<>
					<div
						className="flex flex-1 gap-1"
						aria-hidden="true"
					>
						{[1, 2, 3, 4].map((bar) => (
							<span
								key={bar}
								className={cn(
									"h-1 flex-1 rounded-full",
									bar <= LEVELS[label].filled ?
										LEVELS[label].tone
									:	"bg-track",
								)}
							/>
						))}
					</div>
					<span className="text-caption text-ink-2">
						Password strength: {label}
					</span>
				</>
			)}
		</div>
	);
}
