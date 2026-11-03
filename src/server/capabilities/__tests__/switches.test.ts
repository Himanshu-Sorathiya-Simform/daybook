// @vitest-environment node
import { describe, expect, test } from "vitest";
import { parseFlagSwitches, switchName } from "../switches";

describe("switchName (BR-P4-06)", () => {
	test.each([
		["offline.writes", "FLAG_OFFLINE_WRITES"],
		["dashboard.dragAndDrop", "FLAG_DASHBOARD_DRAG_AND_DROP"],
		["sync.background", "FLAG_SYNC_BACKGROUND"],
		[
			"insights.detector.savingsRecommendation",
			"FLAG_INSIGHTS_DETECTOR_SAVINGS_RECOMMENDATION",
		],
		["analytics.weekdayHour.view", "FLAG_ANALYTICS_WEEKDAY_HOUR_VIEW"],
		["a.b2C", "FLAG_A_B2_C"],
	])("%s is %s", (code, name) => {
		expect(switchName(code)).toBe(name);
	});
});

describe("parseFlagSwitches (BR-P4-07)", () => {
	test("an environment with no FLAG_ variable sets no switch", () => {
		expect(parseFlagSwitches({ APP_ORIGIN: "http://localhost:3000" })).toEqual({
			switches: {},
			problems: [],
		});
	});

	test("a variable that is present but undefined is not set", () => {
		expect(parseFlagSwitches({ FLAG_OFFLINE_WRITES: undefined })).toEqual({
			switches: {},
			problems: [],
		});
	});

	test("every flag in the registry can be switched on or off", () => {
		const { switches, problems } = parseFlagSwitches({
			FLAG_OFFLINE_WRITES: "off",
			FLAG_SYNC_BACKGROUND: "on",
			FLAG_INSIGHTS_DETECTOR_CATEGORY_TREND: "off",
			FLAG_INSIGHTS_DETECTOR_BUDGET_THRESHOLD: "off",
			FLAG_INSIGHTS_DETECTOR_SAVINGS_RATE: "on",
			FLAG_INSIGHTS_DETECTOR_OUTLIER: "off",
			FLAG_INSIGHTS_DETECTOR_RENEWALS_SOON: "on",
			FLAG_INSIGHTS_DETECTOR_SAVINGS_RECOMMENDATION: "off",
		});
		expect(problems).toEqual([]);
		expect(switches).toEqual({
			"offline.writes": "off",
			"sync.background": "on",
			"insights.detector.categoryTrend": "off",
			"insights.detector.budgetThreshold": "off",
			"insights.detector.savingsRate": "on",
			"insights.detector.outlier": "off",
			"insights.detector.renewalsSoon": "on",
			"insights.detector.savingsRecommendation": "off",
		});
	});

	test("a lowercase or misspelled name is not a kill switch, and names no code", () => {
		expect(
			parseFlagSwitches({
				FLAG_offline_writes: "on",
				FLAG_OFFLINE_WRITE: "on",
			}).problems,
		).toEqual([
			"FLAG_OFFLINE_WRITE names no capability in the registry",
			"FLAG_offline_writes names no capability in the registry",
		]);
	});

	test("a refused variable sets nothing, and the valid ones beside it still parse", () => {
		const { switches, problems } = parseFlagSwitches({
			FLAG_OFFLINE_WRITES: "of",
			FLAG_SYNC_BACKGROUND: "off",
		});
		expect(switches).toEqual({ "sync.background": "off" });
		expect(problems).toEqual(["FLAG_OFFLINE_WRITES must be on or off"]);
	});

	test("the bare prefix FLAG_ names no code", () => {
		expect(parseFlagSwitches({ FLAG_: "on" }).problems).toEqual([
			"FLAG_ names no capability in the registry",
		]);
	});
});
