---
name: new-private-table
description: "Add a database table that holds a user's private data, with every check such a table must pass: user_id and its cascade, version and timestamps, row-level security enabled and forced with the two exact policies, grants, composite foreign keys, money and date columns, the hand-extended migration, db:verify and the isolation suite. Use whenever a migration adds a table."
argument-hint: "[table name and purpose]"
---

# New private table

A private table holds one user's rows, and the database itself must stop any other user from reading or changing them. The rules come from `docs/platform/P2-data-access-and-security.md` (sections 3 and 4) and `docs/01-root-spec.md` section 9. This skill adds a table without missing one of them.

The request: $ARGUMENTS

If no table is named above, ask me which one.

## 1. Before anything

- The columns come from the feature spec's section 3 (concepts and fields). This skill does not design them. If no spec defines the table, stop and tell me; the spec changes first (`spec-change`).
- Decide the class from P2 section 3:
    - **Private:** the runtime role reads and writes its own rows. Almost every table.
    - **Private, system-written:** entitlements, plan status, capability overrides. The runtime role may only read its own rows, so it gets no write grant.
    - **Reference:** no `user_id`, no RLS, the runtime role reads. Changed only by migrations and the system module.
    - **System:** no `user_id`, no RLS, the runtime role gets nothing.
- Add the table and its class to `TABLE_CLASSES` in `src/server/db/table-classes.ts`. `db:verify` derives the grants and policies the table must have from it, and fails on a table missing from it.
- The rest of this skill is for the two private classes. For reference and system tables, apply the class's row in P2 section 3 and skip steps 3 to 5.

## 2. Columns every private table has

- `id uuid` primary key, a UUIDv7. The client generates it for client creates (ID-1).
- `user_id uuid NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE`.
- `version integer NOT NULL DEFAULT 1` on updatable rows. Every update adds 1.
- `created_at` and `updated_at`, `timestamptz NOT NULL`, with no default. The values are bound parameters from the request clock. SQL and migrations never use `now()`, `current_date`, `current_timestamp`, `localtimestamp` or `DEFAULT now()`, and Drizzle columns never use `.defaultNow()` (BR-P2-43).

Column types: money is `bigint` in the minor unit with a check that the amount is positive and within MON-5 (TXN-2). Dates are `date`, timestamps are `timestamptz`, quantities are `numeric`. Text limits are checked in code points. Category and type values are the stable keys of the specs (NAM-2).

## 3. Keys and relations

- A table that other private rows reference also has `UNIQUE (user_id, id)`.
- A reference to another private table is a composite foreign key `(user_id, parent_id)` to `parent(user_id, id)`, never a single-column key. Postgres skips RLS during foreign-key checks, so a single column could link to another user's row (BR-P2-06).
- The delete action is either `ON DELETE SET NULL (parent_id)`, with the column list, when the child must survive its parent, or `NO ACTION`. Never `RESTRICT`.

## 4. Security, in the migration

Drizzle Kit generates the SQL for the table. Add the rest by hand, then review it (BR-P2-36):

```sql
ALTER TABLE app.<table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.<table> FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_isolation ON app.<table> FOR ALL TO daybook_runtime
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY system_access ON app.<table> FOR ALL TO daybook_system
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.<table> TO daybook_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.<table> TO daybook_system;
```

- Exactly these two policies, copied from BR-P2-04. No other policy, and none for the auth role.
- For a system-written table, the runtime role gets `SELECT` only.
- No grant to `PUBLIC`, no `GRANT ALL`, no grant to the auth role.
- Never in a migration: `SECURITY DEFINER` functions, materialized views over private tables, role creation, or anything that gives a role `BYPASSRLS`. A view over a private table uses `security_invoker = true`.
- A migration that git already tracks never changes. A fix is a new migration.
- Read the generated SQL in order before running it. Drizzle Kit can write a unique constraint after a foreign key that points at it, which Postgres refuses; move the constraint up and say so in the hand-written block (`0002_transactions.sql` did).
- An extension a table needs (`pg_trgm` for a trigram index) is created in the hand-written block, before the index that uses it. Such an index is left out of the Drizzle schema, since Drizzle Kit would write it above the extension.

## 5. Tests

- The isolation suite, `src/server/db/tests/isolation.integration.test.ts`, runs every check (AC-P2-01 to AC-P2-04, AC-P2-06, TST-1) on every private table in `TABLE_CLASSES`. Add a row factory for the new table to `PRIVATE_ROWS` in `src/server/db/tests/private-rows.ts`; the typecheck fails until you do. Confirm the table appears in the suite's run.
- Add table tests: a composite foreign key refuses another user's parent with `parent_missing` (AC-P2-05); deleting a parent behaves as chosen in step 3 (AC-P2-06); deleting the user removes the rows without a foreign-key error.
- `db:verify` must pass (AC-P2-07). `pnpm db:migrate --env .env.test` applies the migration to the Neon test branch and runs the same checks.
- Database tests are `*.integration.test.ts` files, run by `pnpm test:integration`: locally against the Neon test branch from `.env.test`, and in CI. Report what ran where; never claim a run that did not happen.

## 6. Elsewhere

Check the owning feature spec for what must also change: the rows go with Reset my data and account deletion (F01), export, and the demo flag on finance rows (F15). If the table implies a rule no spec states, use `spec-change`.

## 7. Report

Show the final migration SQL and a checklist of steps 2 to 5 with one line each on where it is done. Then say which tests were added, which could not run here, and anything the spec leaves unclear.

## Keep this skill current

Checked against `drizzle/0000_init.sql`, `drizzle/0002_transactions.sql` and the isolation suite on 28 Oct 2026. When a migration, `db:verify` or the suite changes how a table is added, update this skill in the same change.
