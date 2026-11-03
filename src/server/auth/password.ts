import "server-only";
import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(argon2);

/** Argon2id at RFC 9106's second recommended setting (section 4): 64 MiB of memory, 3 passes,
 * 4 lanes, with a 16-byte salt and a 32-byte tag (D-519). The first recommended setting needs
 * 2 GiB per hash, too much for a serverless function. */
export const ARGON2ID = {
	memory: 65_536,
	passes: 3,
	parallelism: 4,
	tagLength: 32,
	saltLength: 16,
} as const;

/** A stored hash in the PHC string format the reference implementation writes:
 * `$argon2id$v=19$m=65536,t=3,p=4$<salt>$<tag>`, in unpadded base64. */
const PHC =
	/^\$argon2id\$v=19\$m=(\d{1,7}),t=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]{11,})\$([A-Za-z0-9+/]{22,86})$/;

/** The most a stored hash may ask for, so a damaged row cannot make one login take minutes or
 * gigabytes. Later, stronger settings stay inside these. */
const LIMITS = { memory: 1_048_576, passes: 10, parallelism: 16 } as const;

const base64 = (bytes: Buffer) => bytes.toString("base64").replace(/=+$/, "");

/** Passwords are compared as NFKC, as Better Auth's own hashing does, so the same password
 * typed with composed or decomposed accents is one password. */
const message = (password: string) => password.normalize("NFKC");

/** Hashes a new password with Argon2id (D-519), for Better Auth's
 * `emailAndPassword.password.hash`. */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(ARGON2ID.saltLength);
	const tag = await derive("argon2id", {
		message: message(password),
		nonce: salt,
		memory: ARGON2ID.memory,
		passes: ARGON2ID.passes,
		parallelism: ARGON2ID.parallelism,
		tagLength: ARGON2ID.tagLength,
	});
	return `$argon2id$v=19$m=${ARGON2ID.memory},t=${ARGON2ID.passes},p=${ARGON2ID.parallelism}$${base64(salt)}$${base64(tag)}`;
}

/**
 * Checks a password against a stored hash, for Better Auth's
 * `emailAndPassword.password.verify`. An Argon2id hash is checked with the settings stored in
 * it, so a later change of `ARGON2ID` leaves older hashes working. Only Argon2id is ever
 * stored: any other value, Better Auth's own scrypt `salt:key` included, is a damaged row, and
 * throws rather than answering "wrong password".
 */
export async function verifyPassword({
	hash,
	password,
}: {
	hash: string;
	password: string;
}): Promise<boolean> {
	const parts = PHC.exec(hash);
	if (!parts) throw new Error("Unrecognized password hash");
	const [, m, t, p, salt, tag] = parts as unknown as [
		string,
		string,
		string,
		string,
		string,
		string,
	];
	const memory = Number(m);
	const passes = Number(t);
	const parallelism = Number(p);
	if (
		parallelism < 1
		|| parallelism > LIMITS.parallelism
		|| passes < 1
		|| passes > LIMITS.passes
		|| memory < 8 * parallelism
		|| memory > LIMITS.memory
	) {
		throw new Error("Password hash settings out of range");
	}
	const expected = Buffer.from(tag, "base64");
	const actual = await derive("argon2id", {
		message: message(password),
		nonce: Buffer.from(salt, "base64"),
		memory,
		passes,
		parallelism,
		tagLength: expected.length,
	});
	return timingSafeEqual(actual, expected);
}
