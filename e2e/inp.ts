import { expect, type Locator, type Page } from "@playwright/test";

/** The INP budget, in milliseconds (root 11.1, D-63, D-580). */
export const INP_BUDGET_MS = 200;

/** Repetitions of each interaction; the worst value counts (P3). */
export const REPETITIONS = 5;

/** The Event Timing entries of one interaction share an `interactionId`. */
type Seen = { id: number; duration: number; name: string; target: string };

/** Event Timing's entry and observer option, which TypeScript's DOM types do not have yet. */
type EventTiming = PerformanceEventTiming & { interactionId?: number };
type EventObserverInit = PerformanceObserverInit & { durationThreshold?: number };

declare global {
	interface Window {
		__interactions: Seen[];
	}
}

/**
 * Starts recording the page's interactions: every pointer, key and click event slower than 16 ms
 * (the least the browser reports), with the interaction it belongs to, as INP counts them. Call
 * it before the page loads, since it works through an init script.
 */
export async function recordInteractions(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const seen: Seen[] = [];
		window.__interactions = seen;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as EventTiming[]) {
				if (entry.interactionId) {
					const target = entry.target as Element | null;
					seen.push({
						id: entry.interactionId,
						duration: entry.duration,
						name: entry.name,
						target:
							target ?
								`${target.tagName.toLowerCase()} "${(target.getAttribute("aria-label") ?? target.textContent ?? "").trim().slice(0, 40)}"`
							:	"",
					});
				}
			}
		}).observe({
			type: "event",
			durationThreshold: 16,
			buffered: true,
		} as EventObserverInit);
	});
}

/** Slows the page's CPU, as P3's INP measure does (4×), to stand in for a phone's. */
export async function throttleCpu(page: Page, rate = 4): Promise<void> {
	const session = await page.context().newCDPSession(page);
	await session.send("Emulation.setCPUThrottlingRate", { rate });
}

/** What an `act` did to the page's responsiveness. */
export type Interaction = {
	/** The slowest interaction's duration, in milliseconds; 0 when none was reported. */
	ms: number;
	/** Which one it was, "click on button "Save"". */
	slowest: string;
};

/**
 * Runs `act` and returns the slowest interaction it caused: an interaction lasts as long as its
 * slowest event, from the input to the next frame, and INP is the worst of them. Interactions
 * under 16 ms are not reported, and count as 0.
 */
export async function worstInteraction(
	page: Page,
	act: () => Promise<void>,
): Promise<Interaction> {
	// What came before is reported a frame or two late: let it arrive, then forget it.
	await page.waitForTimeout(500);
	await page.evaluate(() => {
		window.__interactions.length = 0;
	});
	await act();
	// The browser reports an event's timing after the frame that follows it.
	await page.waitForTimeout(400);
	const seen = await page.evaluate(() => window.__interactions);
	const byInteraction = new Map<number, Seen>();
	for (const entry of seen) {
		const was = byInteraction.get(entry.id);
		if (!was || entry.duration > was.duration)
			byInteraction.set(entry.id, entry);
	}
	let worst: Seen | null = null;
	for (const entry of byInteraction.values()) {
		if (!worst || entry.duration > worst.duration) worst = entry;
	}
	return worst ?
			{ ms: worst.duration, slowest: `${worst.name} on ${worst.target}` }
		:	{ ms: 0, slowest: "none reported" };
}

/** The worst of several runs, with the interaction that was slowest in it. */
export function worstOf(runs: readonly Interaction[]): Interaction {
	return runs.reduce((worst, run) => (run.ms > worst.ms ? run : worst));
}

/** Presses Escape until `overlay` has gone: on a slowed page the first press can come before
 * the overlay has taken focus. */
export async function closeWithEscape(page: Page, overlay: Locator): Promise<void> {
	await expect(async () => {
		await page.keyboard.press("Escape");
		await expect(overlay).toBeHidden({ timeout: 1500 });
	}).toPass({ timeout: 20_000 });
	// Its underlay and focus return finish a moment after it has gone.
	await page.waitForTimeout(600);
}
