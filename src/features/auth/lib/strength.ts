import type { Score } from "@zxcvbn-ts/core";

export type StrengthLabel = "Weak" | "Fair" | "Good" | "Strong";

/** zxcvbn's score as F01 names it (BR-F01-04, D-509): 0 and 1 are both guessable within hours. */
export function strengthLabel(score: Score): StrengthLabel {
	if (score <= 1) return "Weak";
	if (score === 2) return "Fair";
	if (score === 3) return "Good";
	return "Strong";
}

export type ScorePassword = (password: string, userInputs: string[]) => Score;

let loading: Promise<ScorePassword> | null = null;

/** zxcvbn-ts with its common and English dictionaries, loaded once, on first use, so no page
 * downloads them until someone types a password (D-509). A failed load can be tried again. */
export function loadScorer(): Promise<ScorePassword> {
	loading ??= Promise.all([
		import("@zxcvbn-ts/core"),
		import("@zxcvbn-ts/language-common"),
		import("@zxcvbn-ts/language-en"),
	])
		.then(([{ ZxcvbnFactory }, common, english]) => {
			const zxcvbn = new ZxcvbnFactory({
				dictionary: { ...common.dictionary, ...english.dictionary },
				graphs: common.adjacencyGraphs,
				translations: english.translations,
			});
			const score: ScorePassword = (password, userInputs) =>
				zxcvbn.check(password, userInputs).score;
			return score;
		})
		.catch((error: unknown) => {
			loading = null;
			throw error;
		});
	return loading;
}
