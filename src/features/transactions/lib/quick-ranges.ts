/** A run of amounts the Amount control offers in one press: from `minMinor` up to `maxMinor`,
 * both inclusive, either one open. */
export type AmountBounds = { minMinor?: number; maxMinor?: number };

export type QuickRange = AmountBounds & { count: number };

/** How many rows the buckets from `edges[from]` up to `edges[to]` hold. */
function rowsBetween(counts: readonly number[], from: number, to: number): number {
	let rows = 0;
	for (let i = from; i < to; i++) rows += counts[i]!;
	return rows;
}

/**
 * Up to 4 quick amount ranges from the histogram's answer (BR-F03-74, D-524), all in integers:
 * - **Quartile edges:** for k = 1, 2 and 3, the first `edges[i]`, i ≥ 1, whose running count
 *   times 4 reaches k times the rows. Equal edges merge, as the empty range between them is
 *   dropped below.
 * - **Ranges:** below the first quartile edge, between each pair, and from the last one up.
 *   Each runs from its lower edge to 1 minor unit below the next; the first has no lower
 *   bound and the last no upper bound. A range with no rows is dropped.
 * - **None** with fewer than 4 rows, or fewer than 2 ranges left.
 */
export function quickRanges({
	edges,
	counts,
}: {
	edges: readonly number[];
	counts: readonly number[];
}): QuickRange[] {
	const total = rowsBetween(counts, 0, counts.length);
	if (total < 4) return [];

	const cuts: number[] = [];
	for (const k of [1, 2, 3]) {
		for (let i = 1; i < edges.length; i++) {
			if (4 * rowsBetween(counts, 0, i) >= k * total) {
				cuts.push(i);
				break;
			}
		}
	}

	const marks = [0, ...cuts, edges.length - 1];
	const ranges: QuickRange[] = [];
	for (let r = 0; r + 1 < marks.length; r++) {
		const from = marks[r]!;
		const to = marks[r + 1]!;
		const count = rowsBetween(counts, from, to);
		if (count === 0) continue;
		ranges.push({
			...(r === 0 ? {} : { minMinor: edges[from]! }),
			...(r + 2 === marks.length ? {} : { maxMinor: edges[to]! - 1 }),
			count,
		});
	}
	return ranges.length < 2 ? [] : ranges;
}
