import "server-only";
import { sql } from "drizzle-orm";
import type { TransactionFilter } from "@/lib/transactions/url";
import { safeInt } from "../../db/safe-int";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { filterSql, withoutFields } from "./filter";

/** The edge series' steps per decade, finest first (BR-F03-60, D-449). Each is a subset of the
 * one before, so a coarser bucket is always a run of finer ones. */
export const STEPS = [
	[100, 125, 160, 200, 250, 315, 400, 500, 630, 800],
	[100, 160, 250, 400, 630],
	[100, 200, 500],
] as const;

/** The most buckets a histogram may have before the series thins. */
export const MAX_BUCKETS = 40;

/** The series past every amount: 10^12 is above the largest, 999,999,999,999 (MON-5). */
const TOP = 1_000_000_000_000;

/** A series' values in minor units, ascending, from 1 up to `TOP`: each step times every power
 * of ten from 10^-2, kept when it is a whole number. Each value is written as text, the step's
 * digits then zeros, less the two zeros that 10^-2 takes away, so no float or multiplication
 * is ever involved (MON-1). */
export function seriesOf(steps: readonly number[]): number[] {
	const values: number[] = [];
	for (let zeros = 0; zeros <= 12; zeros += 1) {
		for (const step of steps) {
			const digits = `${step}${"0".repeat(zeros)}`;
			if (digits.endsWith("00")) {
				const value = Number.parseInt(digits.slice(0, -2), 10);
				if (value <= TOP) values.push(value);
			}
		}
	}
	return values;
}

const SERIES = STEPS.map(seriesOf);
/** The finest series, which the SQL counts into. */
const FINE = SERIES[0]!;

/**
 * The edges for amounts from `min` to `max` (BR-F03-60): from the largest series value at or
 * below `min` to the smallest above `max`, on the finest series that keeps to 40 buckets or
 * fewer. An amount equal to a series value starts that value's bucket.
 */
export function histogramEdges(min: number, max: number): number[] {
	let edges: number[] = [];
	for (const series of SERIES) {
		const first = series.findLastIndex((value) => value <= min);
		const last = series.findIndex((value) => value > max);
		edges = series.slice(first, last + 1);
		if (edges.length - 1 <= MAX_BUCKETS) break;
	}
	return edges;
}

/**
 * The histogram from counts in the finest series' buckets, keyed by each bucket's lower edge.
 * The chosen edges are finest-series values, so every fine bucket falls in exactly one.
 */
export function mergeBuckets(fine: ReadonlyMap<number, number>): {
	edges: number[];
	counts: number[];
} {
	if (fine.size === 0) return { edges: [], counts: [] };
	const lows = [...fine.keys()].sort((a, b) => a - b);
	const lowest = lows[0]!;
	const highest = FINE[FINE.indexOf(lows.at(-1)!) + 1]!;
	// Any amount in a fine bucket gives the same edges, so its lower edge stands for the
	// smallest amount and one below its upper edge for the largest.
	const edges = histogramEdges(lowest, highest - 1);
	const counts = edges.slice(0, -1).map(() => 0);
	for (const [low, count] of fine) {
		const bucket = edges.findLastIndex((edge) => edge <= low);
		counts[bucket]! += count;
	}
	return { edges, counts };
}

/**
 * The amount histogram in one statement (BR-F03-60, D-476): the filter's confirmed rows,
 * ignoring `min` and `max`, counted into the finest series' buckets by `width_bucket`, then
 * merged into the chosen edges here. No rows give two empty arrays.
 */
export async function amountHistogram(
	tx: Tx,
	ctx: ProfiledContext,
	filter: TransactionFilter,
): Promise<{ edges: number[]; counts: number[] }> {
	const { rows } = await tx.execute<{ bucket: number; n: string }>(
		sql`SELECT width_bucket(amount_minor, ${sql.param(FINE)}::bigint[]) AS bucket,
			count(*)::text AS n
		FROM app.transactions WHERE ${filterSql(withoutFields(filter, "minMinor", "maxMinor"), ctx.profile.currency)} GROUP BY 1`,
	);
	// `width_bucket` numbers buckets from 1: bucket i holds amounts from FINE[i - 1] up to FINE[i].
	return mergeBuckets(
		new Map(rows.map(({ bucket, n }) => [FINE[bucket - 1]!, safeInt(n)])),
	);
}
