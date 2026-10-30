import "server-only";
import { shiftDays, todayIn } from "@/lib/time";

/** How far a client's clock may run ahead of the request clock: 5 minutes (TIME-7,
 * BR-F03-09, BR-P2-20). */
export const CLOCK_SLACK_MS = 5 * 60 * 1000;

/** How many days before its recording date a user may date a Transaction (TIME-7). */
export const WINDOW_DAYS = 10;

/** Whether `instant` is past `limit` plus the clock slack. Both are compared as instants. */
export function pastSlack(instant: string | Date, limit: string | Date): boolean {
	return new Date(instant).getTime() > new Date(limit).getTime() + CLOCK_SLACK_MS;
}

export type EntryWindow = { firstOn: string; lastOn: string };

/** The entry window of a row recorded at `createdAt` (TIME-7, BR-F03-08): its recording date,
 * `createdAt` in the profile zone, and the 10 days before it, inclusive: 11 dates. An edit uses
 * the same anchor, read in the current zone (BR-F03-11). */
export function entryWindow(createdAt: string, timezone: string): EntryWindow {
	const lastOn = todayIn(timezone, new Date(createdAt));
	return { firstOn: shiftDays(lastOn, -WINDOW_DAYS), lastOn };
}

/** Whether `occurredOn` lies in `window`, both ends included. */
export function inWindow(
	occurredOn: string,
	{ firstOn, lastOn }: EntryWindow,
): boolean {
	return occurredOn >= firstOn && occurredOn <= lastOn;
}
