const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Whether `value` is a UUIDv7, in either case (ID-1). Client ids for creates must be one. */
export function isUuidV7(value: string | null | undefined): value is string {
	return typeof value === "string" && UUID_V7.test(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` has the form of a UUID of any version, in either case. A filter's Goal or
 * Subscription id only has to be well formed; one that is not the user's matches no rows. */
export function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && UUID.test(value);
}

const MAX_UUID_V7_TIME = 2 ** 48 - 1;

/**
 * A new UUIDv7 (RFC 9562): 48 bits of `now` in milliseconds, the version, 74 random bits and
 * the variant, in lower case (ID-1). Works in the browser and on the server; the client makes
 * every `Idempotency-Key` with it (ID-2, D-507).
 */
export function uuidV7(now: number = Date.now()): string {
	if (!Number.isSafeInteger(now) || now < 0 || now > MAX_UUID_V7_TIME) {
		throw new RangeError(
			"A UUIDv7 needs a time from 0 to 2^48 - 1 milliseconds",
		);
	}
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6]! & 0x0f) | 0x70;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const random = Array.from(bytes.subarray(6), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	const hex = now.toString(16).padStart(12, "0") + random;
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The instant a UUIDv7 was made, in milliseconds since 1970: its first 48 bits (RFC 9562).
 * A create's id may be at most 5 minutes ahead of the request clock (BR-P2-20). */
export function uuidV7Time(id: string): number {
	return Number.parseInt(id.replace(/-/g, "").slice(0, 12), 16);
}
