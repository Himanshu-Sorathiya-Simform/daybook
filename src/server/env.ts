import "server-only";
import { z } from "zod";

/** Thrown when environment variables are missing or malformed. The message lists each
 * variable and its problem, never a value, so a secret cannot reach a log (BR-P2-38). */
export class EnvError extends Error {
	readonly problems: readonly string[];

	constructor(problems: readonly string[]) {
		const bullet = (problem: string) => `  - ${problem}`;
		super(
			`Environment variables are missing or invalid:\n${problems.map(bullet).join("\n")}`,
		);
		this.name = "EnvError";
		this.problems = problems;
	}
}

// `abort` stops the variable's later checks, so an empty value reports "required" alone.
const required = (name: string) =>
	z
		.string({ error: `${name} is required` })
		.min(1, { error: `${name} is required`, abort: true });

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Every database URL asks for an encrypted connection with a checked certificate (D-413),
 * except one to a Postgres on this machine, such as CI's service container. Without
 * `sslmode`, `pg` does not encrypt at all, and Neon refuses the login as insecure. */
const encrypted = (value: string) => {
	const url = URL.parse(value);
	return (
		url !== null
		&& (LOCAL_HOSTS.has(url.hostname)
			|| url.searchParams.get("sslmode") === "verify-full")
	);
};
const encryptedMessage = (name: string) =>
	`${name} must end with ?sslmode=verify-full (only a localhost database may leave it out)`;

/** A Postgres URL whose user is `role`, so a connection string pasted into the wrong
 * variable (the owner's in the runtime slot, say) stops the app instead of quietly
 * running with the wrong powers. */
const roleUrl = (name: string, role: string) =>
	required(name)
		.refine(
			(value) => {
				const url = URL.parse(value);
				return (
					url !== null
					&& (url.protocol === "postgres:"
						|| url.protocol === "postgresql:")
					&& decodeURIComponent(url.username) === role
				);
			},
			{
				error: `${name} must be a postgres:// URL for the ${role} role`,
				abort: true,
			},
		)
		.refine(encrypted, encryptedMessage(name));

/** The owner's URL: any user except the three Daybook roles, which own nothing. */
const ownerUrl = (name: string) =>
	required(name)
		.refine(
			(value) => {
				const url = URL.parse(value);
				return (
					url !== null
					&& (url.protocol === "postgres:"
						|| url.protocol === "postgresql:")
					&& url.username !== ""
					&& !decodeURIComponent(url.username).startsWith("daybook_")
				);
			},
			{
				error: `${name} must be a postgres:// URL for the database owner, not a daybook_ role`,
				abort: true,
			},
		)
		.refine(encrypted, encryptedMessage(name));

const password = (name: string) =>
	required(name).min(16, `${name} must be at least 16 characters`);

/** What the running app reads. The owner URL and the role passwords are deliberately absent:
 * the app never migrates or creates roles (BR-P2-36), so it never holds the owner's key. */
export const serverEnvSchema = z.object({
	APP_ORIGIN: required("APP_ORIGIN").refine((value) => {
		const url = URL.parse(value);
		return (
			url !== null
			&& (url.protocol === "http:" || url.protocol === "https:")
			&& url.origin === value
		);
	}, "APP_ORIGIN must be an origin like http://localhost:3000, with no path or trailing slash"),
	BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET").min(
		32,
		"BETTER_AUTH_SECRET must be at least 32 characters",
	),
	DATABASE_URL_AUTH: roleUrl("DATABASE_URL_AUTH", "daybook_auth"),
	DATABASE_URL_RUNTIME: roleUrl("DATABASE_URL_RUNTIME", "daybook_runtime"),
	DATABASE_URL_SYSTEM: roleUrl("DATABASE_URL_SYSTEM", "daybook_system"),
	// The build the write queue's `Daybook-Build` must match (D-383). Optional: `dev` when unset
	// or empty, so a local queue and server always agree (D-434). It is echoed back in
	// `build_mismatch`, so only a short id of safe characters is accepted.
	BUILD_ID: z.preprocess(
		(value) => (value === "" ? undefined : value),
		z
			.string()
			.regex(
				/^[A-Za-z0-9._-]{1,64}$/,
				"BUILD_ID must be 1 to 64 letters, digits, dots, dashes or underscores",
			)
			.default("dev"),
	),
});

/** What the database scripts (bootstrap, migrate, verify) read, over the direct endpoint. */
export const ownerEnvSchema = z.object({
	DATABASE_URL_OWNER: ownerUrl("DATABASE_URL_OWNER"),
	DB_PASSWORD_AUTH: password("DB_PASSWORD_AUTH"),
	DB_PASSWORD_RUNTIME: password("DB_PASSWORD_RUNTIME"),
	DB_PASSWORD_SYSTEM: password("DB_PASSWORD_SYSTEM"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type OwnerEnv = z.infer<typeof ownerEnvSchema>;

type Source = Readonly<Record<string, string | undefined>>;

function parseWith<T>(schema: z.ZodType<T>, source: Source): T {
	const result = schema.safeParse(source);
	if (result.success) return result.data;
	// One line per variable; Zod's messages here are ours and carry no input value.
	throw new EnvError(result.error.issues.map((issue) => issue.message));
}

export function parseServerEnv(source: Source): ServerEnv {
	return parseWith(serverEnvSchema, source);
}

export function parseOwnerEnv(source: Source): OwnerEnv {
	return parseWith(ownerEnvSchema, source);
}

let cached: ServerEnv | undefined;

/** The validated server environment, read from `process.env` on first use. */
export function serverEnv(): ServerEnv {
	cached ??= parseServerEnv(process.env);
	return cached;
}
