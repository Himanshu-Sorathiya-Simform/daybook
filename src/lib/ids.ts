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
