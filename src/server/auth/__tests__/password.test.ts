// @vitest-environment node
import { argon2Sync } from "node:crypto";
import { hashPassword as hashScrypt } from "better-auth/crypto";
import { describe, expect, test } from "vitest";

import { ARGON2ID, hashPassword, verifyPassword } from "../password";

const PHC =
	/^\$argon2id\$v=19\$m=65536,t=3,p=4\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/;

/** Hashes written by the C reference implementation (npm `argon2` 0.45.2) for salt
 * 00 01 … 0f at D-519's setting, so these checks do not rest on Node's own output. */
const REFERENCE = {
	"correct horse battery staple":
		"$argon2id$v=19$m=65536,t=3,p=4$AAECAwQFBgcICQoLDA0ODw$hTsnKkTbFCHAKWJmmlXrCZTzyrOF7RxMeSU+7hm6tJ4",
	"pässwörd 🔑":
		"$argon2id$v=19$m=65536,t=3,p=4$AAECAwQFBgcICQoLDA0ODw$+C+qRgfr4ToWr0y02GHI2J5DPK4CBkMpH7OrrAt91vA",
} as const;

describe("the platform's Argon2id (D-519)", () => {
	// RFC 9106 section 5.3: the standard's own Argon2id test vector, with secret and
	// associated data. It shows the Node.js this runs on implements the standard exactly.
	test("matches RFC 9106's Argon2id test vector", () => {
		const tag = argon2Sync("argon2id", {
			message: Buffer.alloc(32, 1),
			nonce: Buffer.alloc(16, 2),
			secret: Buffer.alloc(8, 3),
			associatedData: Buffer.alloc(12, 4),
			passes: 3,
			memory: 32,
			parallelism: 4,
			tagLength: 32,
		});
		expect(tag.toString("hex")).toBe(
			"0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659",
		);
	});
});

describe("hashPassword (D-519)", () => {
	test("uses RFC 9106's second recommended setting", () => {
		expect(ARGON2ID).toEqual({
			memory: 65_536,
			passes: 3,
			parallelism: 4,
			tagLength: 32,
			saltLength: 16,
		});
	});

	test("writes a PHC string with a 16-byte salt and a 32-byte tag", async () => {
		const hash = await hashPassword("correct horse battery staple");
		const [, salt, tag] = PHC.exec(hash) ?? [];
		expect(Buffer.from(salt ?? "", "base64")).toHaveLength(16);
		expect(Buffer.from(tag ?? "", "base64")).toHaveLength(32);
	});

	test("salts every hash afresh, so one password never hashes the same twice", async () => {
		const hashes = await Promise.all(
			Array.from({ length: 4 }, () => hashPassword("same password here")),
		);
		expect(new Set(hashes).size).toBe(4);
		expect(new Set(hashes.map((hash) => PHC.exec(hash)?.[1])).size).toBe(4);
	});

	test("never contains the password", async () => {
		const password = "correct horse battery staple";
		const hash = await hashPassword(password);
		expect(hash).not.toContain(password);
		expect(hash).not.toContain(
			Buffer.from(password).toString("base64").slice(0, 12),
		);
	});

	test.each([
		"correct horse battery staple",
		"pässwörd 🔑 ünïcode",
		"x".repeat(128),
		"   spaces kept at both ends   ",
	])("%j verifies against its own hash", async (password) => {
		expect(
			await verifyPassword({ hash: await hashPassword(password), password }),
		).toBe(true);
	});
});

describe("verifyPassword (D-519)", () => {
	test.each(Object.entries(REFERENCE))(
		"accepts the reference implementation's hash of %j",
		async (password, hash) => {
			expect(await verifyPassword({ hash, password })).toBe(true);
		},
	);

	test("a hash from hashPassword verifies in the reference format's terms", async () => {
		// Same password and salt as the reference hash: the tags must match exactly.
		const ours = argon2Sync("argon2id", {
			message: "correct horse battery staple",
			nonce: Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"),
			memory: ARGON2ID.memory,
			passes: ARGON2ID.passes,
			parallelism: ARGON2ID.parallelism,
			tagLength: ARGON2ID.tagLength,
		})
			.toString("base64")
			.replace(/=+$/, "");
		expect(REFERENCE["correct horse battery staple"].endsWith(`$${ours}`)).toBe(
			true,
		);
	});

	test.each([
		["another password", "correct horse battery staple!"],
		["a different case", "Correct horse battery staple"],
		["one character short", "correct horse battery stapl"],
		["the empty string", ""],
	])("refuses %s", async (_name, password) => {
		expect(
			await verifyPassword({
				hash: REFERENCE["correct horse battery staple"],
				password,
			}),
		).toBe(false);
	});

	test("compares NFKC forms, so composed and decomposed accents are one password", async () => {
		const composed = "pässwörd 🔑";
		const decomposed = composed.normalize("NFD");
		expect(decomposed).not.toBe(composed);
		expect(
			await verifyPassword({
				hash: REFERENCE[composed],
				password: decomposed,
			}),
		).toBe(true);
	});

	test("a changed tag fails", async () => {
		// The first tag character: the last one's low bits are padding the decoder drops.
		const hash = REFERENCE["correct horse battery staple"].replace(
			"$hTsn",
			"$iTsn",
		);
		expect(
			await verifyPassword({ hash, password: "correct horse battery staple" }),
		).toBe(false);
	});

	test("reads the settings from the stored hash, so older settings keep working", async () => {
		const salt = Buffer.alloc(16, 7);
		const tag = argon2Sync("argon2id", {
			message: "an older hash",
			nonce: salt,
			memory: 19_456,
			passes: 2,
			parallelism: 1,
			tagLength: 32,
		});
		const hash = `$argon2id$v=19$m=19456,t=2,p=1$${salt.toString("base64").replace(/=+$/, "")}$${tag.toString("base64").replace(/=+$/, "")}`;
		expect(await verifyPassword({ hash, password: "an older hash" })).toBe(true);
		expect(await verifyPassword({ hash, password: "an older hasH" })).toBe(
			false,
		);
	});

	test.each([16, 64])(
		"reads the tag length from the stored hash (%i bytes)",
		async (length) => {
			const salt = Buffer.alloc(16, 5);
			const tag = argon2Sync("argon2id", {
				message: "tag length",
				nonce: salt,
				memory: 1024,
				passes: 1,
				parallelism: 1,
				tagLength: length,
			});
			const hash = `$argon2id$v=19$m=1024,t=1,p=1$${salt.toString("base64").replace(/=+$/, "")}$${tag.toString("base64").replace(/=+$/, "")}`;
			expect(await verifyPassword({ hash, password: "tag length" })).toBe(
				true,
			);
			expect(await verifyPassword({ hash, password: "tag lengths" })).toBe(
				false,
			);
		},
	);

	// D-519: only Argon2id is stored; there are no older hashes to keep working.
	test("throws on Better Auth's scrypt format rather than checking it", async () => {
		const hash = await hashScrypt("an earlier account's password");
		expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
		await expect(
			verifyPassword({ hash, password: "an earlier account's password" }),
		).rejects.toThrow("Unrecognized password hash");
	});

	test.each([
		[
			"another Argon2 variant",
			"$argon2i$v=19$m=65536,t=3,p=4$AAECAwQFBgcICQoLDA0ODw$hTsnKkTbFCHAKWJmmlXrCZTzyrOF7RxMeSU+7hm6tJ4",
		],
		[
			"another version",
			"$argon2id$v=16$m=65536,t=3,p=4$AAECAwQFBgcICQoLDA0ODw$hTsnKkTbFCHAKWJmmlXrCZTzyrOF7RxMeSU+7hm6tJ4",
		],
		["a missing part", "$argon2id$v=19$m=65536,t=3,p=4$AAECAwQFBgcICQoLDA0ODw"],
		[
			"settings in another order",
			"$argon2id$v=19$t=3,m=65536,p=4$AAECAwQFBgcICQoLDA0ODw$hTsnKkTbFCHAKWJmmlXrCZTzyrOF7RxMeSU+7hm6tJ4",
		],
		[
			"a salt under 8 bytes",
			"$argon2id$v=19$m=65536,t=3,p=4$AAECAwQFBg$hTsnKkTbFCHAKWJmmlXrCZTzyrOF7RxMeSU+7hm6tJ4",
		],
		[
			"a tag under 16 bytes",
			"$argon2id$v=19$m=65536,t=3,p=4$AAECAwQFBgcICQoLDA0ODw$hTsnKkTbFCHAKWJmmlXr",
		],
		[
			"characters outside base64",
			"$argon2id$v=19$m=65536,t=3,p=4$AAECAwQFBgcICQoLDA0OD!$hTsnKkTbFCHAKWJmmlXrCZTzyrOF7RxMeSU+7hm6tJ4",
		],
		["only a dollar sign", "$"],
		["the empty string", ""],
		["a plain password stored by mistake", "correct horse battery staple"],
	])("throws on %s, since the stored row is damaged", async (_name, hash) => {
		await expect(
			verifyPassword({ hash, password: "correct horse battery staple" }),
		).rejects.toThrow("Unrecognized password hash");
	});

	test.each([
		["memory over 1 GiB", "m=1048577,t=3,p=4"],
		["memory under 8 blocks a lane", "m=31,t=3,p=4"],
		["no passes", "m=65536,t=0,p=4"],
		["more than 10 passes", "m=65536,t=11,p=4"],
		["no lanes", "m=65536,t=3,p=0"],
		["more than 16 lanes", "m=65536,t=3,p=17"],
	])(
		"throws on %s, so a damaged row cannot cost minutes or gigabytes",
		async (_name, settings) => {
			const hash = `$argon2id$v=19$${settings}$AAECAwQFBgcICQoLDA0ODw$hTsnKkTbFCHAKWJmmlXrCZTzyrOF7RxMeSU+7hm6tJ4`;
			await expect(
				verifyPassword({ hash, password: "correct horse battery staple" }),
			).rejects.toThrow("Password hash settings out of range");
		},
	);

	test.each([
		["exactly 1 GiB", "m=1048576,t=1,p=1", 1_048_576, 1, 1],
		["8 blocks a lane", "m=32,t=10,p=4", 32, 10, 4],
		["16 lanes", "m=128,t=1,p=16", 128, 1, 16],
	])(
		"accepts the edge of the limits: %s",
		async (_name, settings, memory, passes, parallelism) => {
			const salt = Buffer.alloc(16, 9);
			const tag = argon2Sync("argon2id", {
				message: "edge",
				nonce: salt,
				memory,
				passes,
				parallelism,
				tagLength: 32,
			});
			const hash = `$argon2id$v=19$${settings}$${salt.toString("base64").replace(/=+$/, "")}$${tag.toString("base64").replace(/=+$/, "")}`;
			expect(await verifyPassword({ hash, password: "edge" })).toBe(true);
		},
	);
});
