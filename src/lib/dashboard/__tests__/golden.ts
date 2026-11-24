import type { FigureLocale } from "../figures";

/** Golden October and September, as F08 section 5 lists them (docs/03-golden-dataset.md): the
 * days with Out, in minor units. A refund day is negative. */
export const SEPTEMBER_DAILY = [
	{ date: "2026-09-01", outMinor: 1800000 },
	{ date: "2026-09-03", outMinor: 185000 },
	{ date: "2026-09-05", outMinor: 64900 },
	{ date: "2026-09-08", outMinor: 240000 },
	{ date: "2026-09-10", outMinor: 150000 },
	{ date: "2026-09-12", outMinor: 320000 },
	{ date: "2026-09-20", outMinor: 45000 },
];

export const OCTOBER_DAILY = [
	{ date: "2026-10-01", outMinor: 1800000 },
	{ date: "2026-10-04", outMinor: 230000 },
	{ date: "2026-10-05", outMinor: 64900 },
	{ date: "2026-10-07", outMinor: 450000 },
	{ date: "2026-10-09", outMinor: -150000 },
	{ date: "2026-10-11", outMinor: 180000 },
	{ date: "2026-10-12", outMinor: 149900 },
	{ date: "2026-10-14", outMinor: 290000 },
	{ date: "2026-10-19", outMinor: 64000 },
	{ date: "2026-10-31", outMinor: 38000 },
];

export const NOVEMBER_DAILY = [{ date: "2026-11-01", outMinor: 1842000 }];

/** The golden profile: INR, `en-IN` dates, Indian digits grouping in Latin digits. */
export const GOLDEN_LOCALE: FigureLocale = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

/** A valid UUIDv7, and others for tests that need several. */
export const VIEW_ID = "0199a000-0000-7000-8001-000000000001";
export const VIEW_ID_2 = "0199a000-0000-7000-8001-000000000002";
export const VIEW_ID_3 = "0199a000-0000-7000-8001-000000000003";

export const NINE = "2026-11-02T03:30:00Z";
export const TEN = "2026-11-02T04:30:00Z";
