"use client";

import { Select } from "@/components/forms/Select";
import { zonesOf } from "@/lib/geo";
import { ONBOARDING_TEXT } from "../lib/messages";
import { zoneLabel, zoneOptions } from "../lib/options";

export type TimeZoneFieldProps = {
	/** `null` before a country is chosen. */
	country: string | null;
	value: string;
	onChange: (zone: string) => void;
	/** When the offsets are worked out (D-511). */
	at: Date;
	error?: string | undefined;
	isDisabled?: boolean;
};

/** Onboarding's time zone (F02 section 6, D-511): a list of the country's zones in `zone.tab`
 * order, or, for a country with one zone, that zone as text; before a country, a dash. */
export function TimeZoneField({
	country,
	value,
	onChange,
	at,
	error,
	isDisabled = false,
}: Readonly<TimeZoneFieldProps>) {
	const zones = country ? zonesOf(country) : [];
	if (country && zones.length > 1) {
		return (
			<Select
				label="Time zone"
				hint={ONBOARDING_TEXT.timezoneHint}
				error={error}
				options={zoneOptions(country, at)}
				value={value}
				isDisabled={isDisabled}
				onChange={(zone) => onChange(String(zone))}
			/>
		);
	}
	return (
		<div className="flex flex-col gap-1.25">
			<span className="text-caption text-ink font-semibold">Time zone</span>
			<p className="text-body text-ink">
				{zones[0] ? zoneLabel(zones[0], false, at) : "—"}
			</p>
			{error ?
				<p className="text-caption text-neg font-medium">{error}</p>
			:	<p className="text-caption text-ink-3">
					{ONBOARDING_TEXT.timezoneHint}
				</p>
			}
		</div>
	);
}
