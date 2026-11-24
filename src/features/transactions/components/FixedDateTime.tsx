"use client";

export type FixedDateTimeProps = {
	/** The date as the dialog words it, "Today" or "Mon 2 Nov". */
	date: string;
	/** The time, or "Automatic" for a charge. */
	time: string;
};

/**
 * The date and time as text, for a row they cannot change on: a charge a Subscription added, or
 * a demo row (BR-F03-16, BR-F03-75).
 */
export function FixedDateTime({ date, time }: Readonly<FixedDateTimeProps>) {
	return (
		<dl className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2.5">
			<div className="flex flex-col gap-1.25">
				<dt className="text-caption text-ink font-semibold">Date</dt>
				<dd className="text-body text-ink">{date}</dd>
			</div>
			<div className="flex flex-col gap-1.25">
				<dt className="text-caption text-ink font-semibold">Time</dt>
				<dd className="text-body text-ink">{time}</dd>
			</div>
		</dl>
	);
}
