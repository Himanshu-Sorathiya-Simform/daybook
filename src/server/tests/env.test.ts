// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { EnvError, parseOwnerEnv, parseServerEnv } from "../env";

// Placeholder values only; none of these is a real credential.
const roleUrl = (role: string) =>
	`postgresql://${role}:pw@db-pooler.example.com/neondb?sslmode=verify-full`;

const validServer = {
	APP_ORIGIN: "http://localhost:3000",
	BETTER_AUTH_SECRET: "x".repeat(32),
	DATABASE_URL_AUTH: roleUrl("daybook_auth"),
	DATABASE_URL_RUNTIME: roleUrl("daybook_runtime"),
	DATABASE_URL_SYSTEM: roleUrl("daybook_system"),
};

const validOwner = {
	DATABASE_URL_OWNER:
		"postgresql://neondb_owner:pw@db.example.com/neondb?sslmode=verify-full",
	DB_PASSWORD_AUTH: "a".repeat(16),
	DB_PASSWORD_RUNTIME: "r".repeat(16),
	DB_PASSWORD_SYSTEM: "s".repeat(16),
};

/** The problems an invalid source produces, or a failure if it parses. */
function problemsOf(parse: () => unknown): readonly string[] {
	try {
		parse();
	} catch (error) {
		if (error instanceof EnvError) return error.problems;
		throw error;
	}
	throw new Error("Expected the environment to be refused");
}

describe("parseServerEnv", () => {
	test("returns every app variable from a valid source", () => {
		expect(parseServerEnv(validServer)).toEqual({
			...validServer,
			BUILD_ID: "dev",
		});
	});

	describe("BUILD_ID", () => {
		test("is kept when set", () => {
			expect(
				parseServerEnv({ ...validServer, BUILD_ID: "3f2a9c1" }).BUILD_ID,
			).toBe("3f2a9c1");
		});

		test.each([
			["unset", undefined],
			["empty", ""],
		])("is dev when %s", (_name, value) => {
			expect(
				parseServerEnv({ ...validServer, BUILD_ID: value }).BUILD_ID,
			).toBe("dev");
		});

		test("accepts letters, digits, dots, dashes and underscores", () => {
			const id = "v1.2_rc-3";
			expect(parseServerEnv({ ...validServer, BUILD_ID: id }).BUILD_ID).toBe(
				id,
			);
		});

		test.each([
			["a space", "a b"],
			["markup", "<script>"],
			["65 characters", "a".repeat(65)],
		])("refuses a value with %s, without echoing it", (_name, value) => {
			const problems = problemsOf(() =>
				parseServerEnv({ ...validServer, BUILD_ID: value }),
			);
			expect(problems).toEqual([
				"BUILD_ID must be 1 to 64 letters, digits, dots, dashes or underscores",
			]);
		});

		test("accepts exactly 64 characters", () => {
			expect(
				parseServerEnv({ ...validServer, BUILD_ID: "a".repeat(64) })
					.BUILD_ID,
			).toHaveLength(64);
		});
	});

	test("drops variables the app does not use, such as the owner URL", () => {
		const env = parseServerEnv({ ...validServer, ...validOwner });
		expect(env).not.toHaveProperty("DATABASE_URL_OWNER");
		expect(env).not.toHaveProperty("DB_PASSWORD_RUNTIME");
	});

	// AC-P2-16
	test("lists every missing variable at once", () => {
		expect(problemsOf(() => parseServerEnv({}))).toEqual([
			"APP_ORIGIN is required",
			"BETTER_AUTH_SECRET is required",
			"DATABASE_URL_AUTH is required",
			"DATABASE_URL_RUNTIME is required",
			"DATABASE_URL_SYSTEM is required",
		]);
	});

	test.each(Object.keys(validServer))(
		"treats an empty %s as missing, with no second problem",
		(name) => {
			expect(
				problemsOf(() => parseServerEnv({ ...validServer, [name]: "" })),
			).toEqual([`${name} is required`]);
		},
	);

	test("throws an EnvError whose message lists each problem on its own line", () => {
		expect(() =>
			parseServerEnv({ ...validServer, APP_ORIGIN: undefined }),
		).toThrow(
			"Environment variables are missing or invalid:\n  - APP_ORIGIN is required",
		);
	});

	test("names the error EnvError", () => {
		try {
			parseServerEnv({});
		} catch (error) {
			expect(error).toBeInstanceOf(EnvError);
			expect((error as EnvError).name).toBe("EnvError");
		}
		expect.assertions(2);
	});

	describe("APP_ORIGIN", () => {
		test.each([
			["http with a port", "http://localhost:3000"],
			["https", "https://daybook.example.com"],
		])("accepts %s", (_label, value) => {
			expect(
				parseServerEnv({ ...validServer, APP_ORIGIN: value }).APP_ORIGIN,
			).toBe(value);
		});

		test.each([
			["a trailing slash", "http://localhost:3000/"],
			["a path", "http://localhost:3000/app"],
			["a query", "http://localhost:3000?x=1"],
			["another protocol", "ftp://localhost:3000"],
			["text that is not a URL", "localhost:3000"],
		])("refuses %s", (_label, value) => {
			expect(
				problemsOf(() =>
					parseServerEnv({ ...validServer, APP_ORIGIN: value }),
				),
			).toEqual([
				"APP_ORIGIN must be an origin like http://localhost:3000, with no path or trailing slash",
			]);
		});
	});

	describe("BETTER_AUTH_SECRET", () => {
		test("accepts exactly 32 characters", () => {
			expect(() =>
				parseServerEnv({
					...validServer,
					BETTER_AUTH_SECRET: "x".repeat(32),
				}),
			).not.toThrow();
		});

		test("refuses 31 characters", () => {
			expect(
				problemsOf(() =>
					parseServerEnv({
						...validServer,
						BETTER_AUTH_SECRET: "x".repeat(31),
					}),
				),
			).toEqual(["BETTER_AUTH_SECRET must be at least 32 characters"]);
		});
	});

	describe("role URLs", () => {
		test.each([
			["DATABASE_URL_AUTH", "daybook_auth"],
			["DATABASE_URL_RUNTIME", "daybook_runtime"],
			["DATABASE_URL_SYSTEM", "daybook_system"],
		] as const)("%s refuses the owner's URL in its slot", (name, role) => {
			expect(
				problemsOf(() =>
					parseServerEnv({
						...validServer,
						[name]: validOwner.DATABASE_URL_OWNER,
					}),
				),
			).toEqual([`${name} must be a postgres:// URL for the ${role} role`]);
		});

		test("refuses another Daybook role's URL in the runtime slot", () => {
			expect(
				problemsOf(() =>
					parseServerEnv({
						...validServer,
						DATABASE_URL_RUNTIME: roleUrl("daybook_system"),
					}),
				),
			).toEqual([
				"DATABASE_URL_RUNTIME must be a postgres:// URL for the daybook_runtime role",
			]);
		});

		test("accepts the postgres:// spelling as well as postgresql://", () => {
			const url =
				"postgres://daybook_runtime:pw@db.example.com/neondb?sslmode=verify-full";
			expect(
				parseServerEnv({ ...validServer, DATABASE_URL_RUNTIME: url })
					.DATABASE_URL_RUNTIME,
			).toBe(url);
		});

		test.each([
			["an http URL", "http://daybook_runtime:pw@db.example.com/neondb"],
			["text that is not a URL", "daybook_runtime@db"],
			["a URL with no user", "postgresql://db.example.com/neondb"],
		])("refuses %s", (_label, value) => {
			expect(
				problemsOf(() =>
					parseServerEnv({ ...validServer, DATABASE_URL_RUNTIME: value }),
				),
			).toEqual([
				"DATABASE_URL_RUNTIME must be a postgres:// URL for the daybook_runtime role",
			]);
		});
	});

	describe("encrypted connections", () => {
		const runtimeAt = (rest: string) =>
			`postgresql://daybook_runtime:pw@${rest}`;
		const message =
			"DATABASE_URL_RUNTIME must end with ?sslmode=verify-full (only a localhost database may leave it out)";

		test.each([
			["no sslmode", "db.example.com/neondb"],
			["sslmode=require", "db.example.com/neondb?sslmode=require"],
			["sslmode=disable", "db.example.com/neondb?sslmode=disable"],
			[
				"sslmode in the path instead of the query",
				"db.example.com/neondb/sslmode=verify-full",
			],
		])("refuses a remote URL with %s", (_label, rest) => {
			expect(
				problemsOf(() =>
					parseServerEnv({
						...validServer,
						DATABASE_URL_RUNTIME: runtimeAt(rest),
					}),
				),
			).toEqual([message]);
		});

		test("accepts sslmode=verify-full beside other parameters", () => {
			const url = runtimeAt(
				"db.example.com/neondb?channel_binding=require&sslmode=verify-full",
			);
			expect(
				parseServerEnv({ ...validServer, DATABASE_URL_RUNTIME: url })
					.DATABASE_URL_RUNTIME,
			).toBe(url);
		});

		test.each(["localhost:5432", "127.0.0.1:5432", "[::1]:5432"])(
			"accepts %s without sslmode, as CI's Postgres container is reached",
			(host) => {
				const url = runtimeAt(`${host}/daybook`);
				expect(
					parseServerEnv({ ...validServer, DATABASE_URL_RUNTIME: url })
						.DATABASE_URL_RUNTIME,
				).toBe(url);
			},
		);

		test("reports only the wrong role, not encryption too, for another role's unencrypted URL", () => {
			expect(
				problemsOf(() =>
					parseServerEnv({
						...validServer,
						DATABASE_URL_RUNTIME:
							"postgresql://daybook_auth:pw@db.example.com/neondb",
					}),
				),
			).toEqual([
				"DATABASE_URL_RUNTIME must be a postgres:// URL for the daybook_runtime role",
			]);
		});

		test("checks the owner URL the same way", () => {
			expect(
				problemsOf(() =>
					parseOwnerEnv({
						...validOwner,
						DATABASE_URL_OWNER:
							"postgresql://neondb_owner:pw@db.example.com/neondb",
					}),
				),
			).toEqual([
				"DATABASE_URL_OWNER must end with ?sslmode=verify-full (only a localhost database may leave it out)",
			]);
		});

		test("accepts a localhost owner URL without sslmode", () => {
			const url = "postgresql://postgres:pw@localhost:5432/daybook";
			expect(
				parseOwnerEnv({ ...validOwner, DATABASE_URL_OWNER: url })
					.DATABASE_URL_OWNER,
			).toBe(url);
		});

		test("reports only the owner rule for an unencrypted daybook_ URL in the owner slot", () => {
			expect(
				problemsOf(() =>
					parseOwnerEnv({
						...validOwner,
						DATABASE_URL_OWNER:
							"postgresql://daybook_runtime:pw@db.example.com/neondb",
					}),
				),
			).toEqual([
				"DATABASE_URL_OWNER must be a postgres:// URL for the database owner, not a daybook_ role",
			]);
		});
	});

	test("never puts a variable's value in the error", () => {
		try {
			parseServerEnv({
				...validServer,
				BETTER_AUTH_SECRET: "short-but-secret",
				DATABASE_URL_RUNTIME:
					"postgresql://neondb_owner@do-not-print-me.example.com/neondb",
			});
		} catch (error) {
			expect((error as Error).message).not.toContain("do-not-print-me");
			expect((error as Error).message).not.toContain("short-but-secret");
		}
		expect.assertions(2);
	});
});

describe("parseOwnerEnv", () => {
	test("returns the owner URL and the three passwords from a valid source", () => {
		expect(parseOwnerEnv(validOwner)).toEqual(validOwner);
	});

	test("lists every missing variable at once", () => {
		expect(problemsOf(() => parseOwnerEnv({}))).toEqual([
			"DATABASE_URL_OWNER is required",
			"DB_PASSWORD_AUTH is required",
			"DB_PASSWORD_RUNTIME is required",
			"DB_PASSWORD_SYSTEM is required",
		]);
	});

	test.each(Object.keys(validOwner))(
		"treats an empty %s as missing, with no second problem",
		(name) => {
			expect(
				problemsOf(() => parseOwnerEnv({ ...validOwner, [name]: "" })),
			).toEqual([`${name} is required`]);
		},
	);

	test.each(["daybook_runtime", "daybook_auth", "daybook_system"])(
		"refuses a %s URL as the owner",
		(role) => {
			expect(
				problemsOf(() =>
					parseOwnerEnv({
						...validOwner,
						DATABASE_URL_OWNER: `postgresql://${role}:pw@db.example.com/neondb?sslmode=verify-full`,
					}),
				),
			).toEqual([
				"DATABASE_URL_OWNER must be a postgres:// URL for the database owner, not a daybook_ role",
			]);
		},
	);

	test.each([
		["a URL with no user", "postgresql://db.example.com/neondb"],
		["an https URL", "https://neondb_owner:pw@db.example.com/neondb"],
		["text that is not a URL", "neondb_owner"],
	])("refuses %s as the owner", (_label, value) => {
		expect(
			problemsOf(() =>
				parseOwnerEnv({ ...validOwner, DATABASE_URL_OWNER: value }),
			),
		).toEqual([
			"DATABASE_URL_OWNER must be a postgres:// URL for the database owner, not a daybook_ role",
		]);
	});

	test.each([
		"DB_PASSWORD_AUTH",
		"DB_PASSWORD_RUNTIME",
		"DB_PASSWORD_SYSTEM",
	] as const)("%s accepts 16 characters and refuses 15", (name) => {
		expect(() =>
			parseOwnerEnv({ ...validOwner, [name]: "p".repeat(16) }),
		).not.toThrow();
		expect(
			problemsOf(() =>
				parseOwnerEnv({ ...validOwner, [name]: "p".repeat(15) }),
			),
		).toEqual([`${name} must be at least 16 characters`]);
	});
});

describe("serverEnv", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	function stubServerEnv(values: Record<string, string>) {
		for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
	}

	test("reads and validates process.env", async () => {
		stubServerEnv({ ...validServer, BUILD_ID: "" });
		const { serverEnv } = await import("../env");
		expect(serverEnv()).toEqual({ ...validServer, BUILD_ID: "dev" });
	});

	test("reads process.env once and reuses the result", async () => {
		stubServerEnv(validServer);
		const { serverEnv } = await import("../env");
		const first = serverEnv();
		vi.stubEnv("APP_ORIGIN", "https://changed.example.com");
		expect(serverEnv()).toBe(first);
	});

	// AC-P2-16
	test("throws when a variable is missing", async () => {
		stubServerEnv({ ...validServer, DATABASE_URL_RUNTIME: "" });
		const { serverEnv, EnvError: FreshEnvError } = await import("../env");
		expect(() => serverEnv()).toThrow(FreshEnvError);
	});
});
