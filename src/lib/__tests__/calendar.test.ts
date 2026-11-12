import { expect, test } from "vitest";

import { ARIA_FIRST_DAY } from "@/lib/calendar";
import { WEEK_STARTS } from "@/lib/profile";

test("names every profile week start the way React Aria's calendar does", () => {
	expect(WEEK_STARTS.map((start) => ARIA_FIRST_DAY[start])).toEqual([
		"mon",
		"sun",
		"sat",
	]);
});
