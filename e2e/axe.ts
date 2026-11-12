import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Scans the page with axe for WCAG 2.2 A and AA and fails on any serious or critical
 * violation (BR-P3-13), naming the rule and the elements. */
export async function scan(page: Page, what: string) {
	// A sheet or menu fades in; measured mid-fade, its text looks faint to the contrast check.
	await page.waitForFunction(() =>
		document
			.getAnimations()
			.every((animation) => animation.playState !== "running"),
	);
	const { violations } = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
		.analyze();
	const serious = violations
		.filter(
			(violation) =>
				violation.impact === "serious" || violation.impact === "critical",
		)
		.map(
			(violation) =>
				`${violation.id} (${violation.impact}): ${violation.nodes
					.map((node) => node.target.join(" "))
					.join(", ")}`,
		);
	expect(serious, `axe on ${what}`).toEqual([]);
}
