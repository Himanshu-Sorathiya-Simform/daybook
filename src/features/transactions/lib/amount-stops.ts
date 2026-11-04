import type { AmountBounds } from "./quick-ranges";

/** The two thumbs' places, as edge indexes: `[low, high]`, low below high. */
export type Thumbs = readonly [number, number];

/**
 * The Amount slider's thumbs for the committed bounds, on the histogram's edges (BR-F03-39):
 * the lower thumb on the last edge at or below `min`, or the first edge with no `min`; the
 * upper thumb on the first edge above `max`, or the last edge with no `max`. Bounds typed
 * between edges land on the edges around them, and the thumbs stay at least one edge apart
 * (D-539). `edges` holds at least two values.
 */
export function thumbsOf(
	edges: readonly number[],
	{ minMinor, maxMinor }: AmountBounds,
): Thumbs {
	const last = edges.length - 1;
	let low = 0;
	if (minMinor !== undefined) {
		while (low + 1 < last && edges[low + 1]! <= minMinor) low++;
	}
	let high = last;
	if (maxMinor !== undefined) {
		high = edges.findIndex((edge, i) => i > 0 && edge > maxMinor);
		if (high === -1) high = last;
	}
	return high > low ? [low, high] : [low, low + 1];
}

/** The bounds two thumbs write (BR-F03-39): the lower thumb its edge as `min`, none at the
 * first edge; the upper thumb 1 minor unit below its edge as `max`, none at the last edge. */
export function boundsOf(
	edges: readonly number[],
	[low, high]: Thumbs,
): AmountBounds {
	return {
		...(low === 0 ? {} : { minMinor: edges[low]! }),
		...(high === edges.length - 1 ? {} : { maxMinor: edges[high]! - 1 }),
	};
}
