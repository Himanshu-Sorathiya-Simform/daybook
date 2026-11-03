import { uuidV7 } from "@/lib/ids";
import { emitApiEvent } from "./events";

/** How long a request may go unanswered before it counts as a timeout (STATE-4, D-507). */
export const API_TIMEOUT_MS = 20_000;

/** How a request failed: an answer with an error status, no answer at all, or no answer in
 * time. */
export type ApiErrorKind = "http" | "network" | "timeout";

/** A failed API request. `code`, `fields`, `details` and `requestId` come from the error
 * envelope (API-9); an answer without one, such as a proxy's HTML 502, has `code` null. */
export class ApiRequestError extends Error {
	readonly kind: ApiErrorKind;
	readonly status: number | null;
	readonly code: string | null;
	readonly fields: Record<string, string>;
	readonly details: Record<string, unknown>;
	readonly requestId: string | null;

	constructor(
		kind: ApiErrorKind,
		{
			status = null,
			code = null,
			message = "",
			fields = {},
			details = {},
			requestId = null,
			cause,
		}: {
			status?: number | null;
			code?: string | null;
			message?: string;
			fields?: Record<string, string>;
			details?: Record<string, unknown>;
			requestId?: string | null;
			cause?: unknown;
		} = {},
	) {
		super(message, { cause });
		this.name = "ApiRequestError";
		this.kind = kind;
		this.status = status;
		this.code = code;
		this.fields = fields;
		this.details = details;
		this.requestId = requestId;
	}
}

export type ApiFetchOptions = {
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	/** A mutation's body; `{}` when left out (API-2). */
	body?: unknown;
	/** The user action's key. A retry of the same action passes the key it was given, so the
	 * server answers it once (API-3); otherwise each call makes a new one. */
	idempotencyKey?: string;
	/** The row's version, sent as `If-Match` (API-4). */
	version?: number;
	/** The caller's own cancel, such as TanStack Query's when a query is dropped. */
	signal?: AbortSignal;
};

type Envelope = {
	error?: {
		code?: unknown;
		message?: unknown;
		fields?: unknown;
		details?: unknown;
		requestId?: unknown;
	};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

/** The error for an answer with an error status, from its envelope when it has one. */
async function errorOf(response: Response): Promise<ApiRequestError> {
	const body = (await readJson(response)) as Envelope | undefined;
	const error = isRecord(body) && isRecord(body.error) ? body.error : {};
	return new ApiRequestError("http", {
		status: response.status,
		code: typeof error.code === "string" ? error.code : null,
		message: typeof error.message === "string" ? error.message : "",
		fields:
			isRecord(error.fields) ? (error.fields as Record<string, string>) : {},
		details: isRecord(error.details) ? error.details : {},
		requestId:
			typeof error.requestId === "string" ?
				error.requestId
			:	response.headers.get("x-request-id"),
	});
}

/** Tells the app what an error means beyond the page that asked (STATE-4). */
function announce(error: ApiRequestError): void {
	if (error.status === 401) emitApiEvent({ type: "unauthenticated" });
	else if (error.code === "profile_required")
		emitApiEvent({ type: "profile_required" });
	else if (error.code === "premium_required" || error.code === "feature_off") {
		emitApiEvent({ type: "capabilities_changed" });
	}
}

/**
 * Calls a Daybook route from the browser and answers its `data` (API-11), or `undefined` for a
 * 204. Every page's API call goes through here (STATE-4, D-507):
 * - a mutation sends JSON with an `Idempotency-Key` (a UUIDv7, ID-2) and `If-Match` when given
 *   a version; a read sends neither;
 * - no answer within 20 seconds is a `timeout`, no answer at all a `network` error;
 * - an error status throws an `ApiRequestError` with the envelope's fields, after telling the
 *   app about a 401, a `profile_required`, a `premium_required` or a `feature_off`.
 * Better Auth's `/api/auth/*` has its own client and error shape, and is refused here, so its
 * 401s never look like an expired session (P2 section 8).
 */
export async function apiFetch<T>(
	path: string,
	{ method = "GET", body, idempotencyKey, version, signal }: ApiFetchOptions = {},
): Promise<T> {
	if (!path.startsWith("/api/") || path.startsWith("/api/auth/")) {
		throw new TypeError(
			`apiFetch calls Daybook's own /api routes only, not ${path}`,
		);
	}
	const mutation = method !== "GET";
	const headers: Record<string, string> = { accept: "application/json" };
	if (mutation) {
		headers["content-type"] = "application/json";
		headers["idempotency-key"] = idempotencyKey ?? uuidV7();
	}
	if (version !== undefined) headers["if-match"] = `"${version}"`;

	// Our own timer rather than `AbortSignal.timeout`, so it is told apart from the caller's
	// cancel, and tests can move the clock.
	const timer = new AbortController();
	const timeout = setTimeout(() => timer.abort(), API_TIMEOUT_MS);
	const combined = signal ? AbortSignal.any([signal, timer.signal]) : timer.signal;

	let response: Response;
	try {
		response = await fetch(new URL(path, window.location.origin), {
			method,
			headers,
			credentials: "same-origin",
			cache: "no-store",
			signal: combined,
			...(mutation ? { body: JSON.stringify(body ?? {}) } : {}),
		});
	} catch (cause) {
		if (signal?.aborted) throw cause;
		throw new ApiRequestError(timer.signal.aborted ? "timeout" : "network", {
			cause,
		});
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		const error = await errorOf(response);
		announce(error);
		throw error;
	}
	if (response.status === 204) return undefined as T;
	const answer = await readJson(response);
	if (!isRecord(answer) || !("data" in answer)) {
		throw new ApiRequestError("http", {
			status: response.status,
			requestId: response.headers.get("x-request-id"),
		});
	}
	return answer["data"] as T;
}
