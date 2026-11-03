// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../../api/errors";
import {
	type Profile,
	readClock,
	type RequestContext,
	requireProfile,
	withProfile,
} from "../context";

const base: RequestContext = {
	requestId: "0192f0c4-8a1b-7c2d-9e3f-0123456789ab",
	user: { id: "u", email: "asha@example.com", name: "Asha" },
	profile: null,
	// The golden clock (TST-3): 2026-11-02T12:00:00+05:30.
	now: new Date("2026-11-02T06:30:00.000Z"),
	today: null,
	pricesUpdated: false,
};

const profile = (timezone: string): Profile => ({
	country: "IN",
	currency: "INR",
	timezone,
	weekStart: "monday",
	lastCatchUpOn: "2026-11-01",
});

describe("withProfile", () => {
	test("adds the profile and today in its zone (TIME-5)", () => {
		const ctx = withProfile(base, profile("Asia/Kolkata"));
		expect(ctx.profile).toEqual(profile("Asia/Kolkata"));
		expect(ctx.today).toBe("2026-11-02");
	});

	test("a zone behind UTC can still be on the day before", () => {
		const ctx = withProfile(
			{ ...base, now: new Date("2026-11-02T03:00:00.000Z") },
			profile("America/Los_Angeles"),
		);
		expect(ctx.today).toBe("2026-11-01");
	});

	test("without a profile, today is null", () => {
		expect(withProfile(base, null)).toEqual({
			...base,
			profile: null,
			today: null,
		});
	});

	test("keeps everything else and does not change the context it was given", () => {
		const ctx = withProfile(base, profile("UTC"));
		expect(ctx).toMatchObject({
			requestId: base.requestId,
			user: base.user,
			now: base.now,
			pricesUpdated: false,
		});
		expect(base.profile).toBeNull();
	});
});

describe("readClock", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test("reads the server clock, which tests freeze (TST-3)", () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-02T06:30:00.000Z"),
		});
		expect(readClock()).toEqual(new Date("2026-11-02T06:30:00.000Z"));
	});
});

describe("requireProfile", () => {
	test("returns the context with its profile and today", () => {
		const ctx = withProfile(base, profile("Asia/Kolkata"));
		const profiled = requireProfile(ctx);
		expect(profiled).toEqual(ctx);
		expect(profiled.profile.currency).toBe("INR");
		expect(profiled.today).toBe("2026-11-02");
	});

	test("keeps today as withProfile set it, in the profile's zone", () => {
		const ctx = withProfile(
			{ ...base, now: new Date("2026-11-02T03:00:00.000Z") },
			profile("America/Los_Angeles"),
		);
		expect(requireProfile(ctx).today).toBe("2026-11-01");
	});

	test("refuses a context without a profile with 403 profile_required", () => {
		expect(() => requireProfile(base)).toThrow(ApiError);
		try {
			requireProfile(base);
		} catch (error) {
			expect(error).toMatchObject({ code: "profile_required", status: 403 });
		}
	});

	test("refuses a profile without today, which withProfile never builds", () => {
		expect(() =>
			requireProfile({
				...base,
				profile: profile("Asia/Kolkata"),
				today: null,
			}),
		).toThrow(expect.objectContaining({ code: "profile_required" }));
	});
});
