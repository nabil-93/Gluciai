# Migration history — one authorized exception

> **This is a record of a one-off exception, not a precedent.**
> Applied migrations are append-only. This document exists because that rule
> was broken once, deliberately, under explicit authorization, and the reasoning
> needs to outlive the commit message.

---

## What changed

One statement, in one file: the historical admin bootstrap at the end of
`supabase/migrations/0005_dashboard_roles.sql`.

**Before** — unguarded `VALUES`:

```sql
insert into public.profiles (user_id, email, name, role)
values ('e40b51e2-…', 'nab.ouhaddou@gmail.com', 'Nabil', 'admin')
on conflict (user_id) do update set role = 'admin';
```

**After** — the same insert, conditional on the referenced auth user existing:

```sql
insert into public.profiles (user_id, email, name, role)
select 'e40b51e2-…', 'nab.ouhaddou@gmail.com', 'Nabil', 'admin'
where exists (
  select 1 from auth.users where id = 'e40b51e2-…'
)
on conflict (user_id) do update set role = 'admin';
```

Nothing else in the file changed. No other migration was touched.

---

## The fresh-database failure it resolves

`public.profiles.user_id` is declared in `0001_init.sql`:

```sql
user_id uuid primary key references auth.users (id) on delete cascade,
```

The foreign key is **not** `DEFERRABLE`, so it is enforced immediately at insert
time. On any database where that specific `auth.users` row does not exist — a
local `supabase db reset`, a CI run, a rebuilt project — the original statement
raised:

```
ERROR: insert or update on table "profiles"
       violates foreign key constraint "profiles_user_id_fkey"
```

The transaction aborted, migration `0005` failed, and **the chain stopped at 5
of 29**. The remaining 24 migrations were unreachable, which meant the schema
could not be reproduced anywhere except the one project where it had already
been applied incrementally.

The trigger created earlier in the same file, `protect_profile_fields()`, is
*not* involved: during a migration `auth.uid()` is null, so the trigger's
`allowed` branch passes the row through with `role = 'admin'` intact. The
foreign key was the sole cause.

For contrast, the correct pattern already appears 75 lines earlier in the same
migration — a set-driven insert that yields zero rows on an empty database
instead of failing:

```sql
insert into public.profiles (user_id, email)
select u.id, u.email from auth.users u
on conflict (user_id) do update set email = excluded.email;
```

The defect was confined to the one literal-valued statement.

---

## Why editing an applied migration was safe here

`0005_dashboard_roles.sql` had already been applied to the hosted project — it
is present in that project's `supabase_migrations.schema_migrations` under
version `0005`. Editing the file therefore does **not** re-run it: the CLI keys
on the version, not on file content.

The question is not whether the file was replayed, but whether the repository
still describes what the database actually did. It does, and this can be proved
without connecting to anything:

> The foreign key `profiles.user_id → auth.users(id)` guarantees that a
> `profiles` row for a given id **cannot exist** unless the matching
> `auth.users` row exists. Any environment that successfully ran the original
> statement therefore has that auth user. In exactly those environments, the
> new `where exists (…)` predicate evaluates to **true**, and the guarded
> statement produces an identical result.

The predicate can only change the outcome where the original would have
**failed outright**. So the edit is semantically neutral everywhere the
migration succeeded, and turns a hard failure into a no-op everywhere else.

This argument requires no access to the hosted database, which is why it was
chosen over the alternatives.

---

## Why not a forward migration

The reflexive fix — add `0030` to correct the state — **does not work for this
failure.** The chain aborts *inside* `0005`; execution never reaches a later
migration. A forward migration can only repair the result of a migration that
succeeded. This one did not.

A pre-migration seed does not work either: `supabase db reset` runs migrations
**before** `seed.sql`, so a seed file cannot satisfy a foreign key required
*during* migration `0005`.

---

## Scope limits

This note authorizes nothing beyond the single statement described above.

- **Rewriting applied migrations is not normal practice here.** The default
  remains append-only: new behaviour goes in a new, higher-numbered migration.
- The exception was granted because (a) the migration was unrunnable on any
  fresh environment, (b) no forward migration could repair it, and (c) the edit
  is provably neutral where the migration had already run.
- Any future request to edit an applied migration needs its own justification
  and its own authorization. Citing this document is not sufficient.

---

## What was NOT done

- **No remote migration history was modified.** No `supabase db push`, no
  `--linked` command, no remote SQL execution, no squash or repair.
- The hosted project's schema, data, policies, functions and
  `schema_migrations` table are all untouched.
- No other migration file was modified.
- No Vercel, EAS, secret, environment variable or deployment was changed.

---

## Verification status

**REMEDIATED IN SOURCE / PENDING LOCAL REBUILD VERIFICATION.**

Reproducibility of the full 29-migration chain against a clean database is
**unverified**. Proving it requires running the local Supabase stack
(`supabase start`, then `supabase db reset`) and confirming that all 29
migrations apply and the resulting policy inventory matches what the migrations
declare. That depends on Docker, which is not installed on the development
machine.

Until that run happens and passes, this fix rests on static reasoning about the
foreign key — sound, but not the same thing as a green rebuild.

---

## Unrelated observation, recorded not fixed

The bootstrap statement hardcodes the project owner's personal email address in
a tracked file. It is not a credential, and it is not what this change is about.
Nothing in `src/` references either the UUID or the email — the patient app
contains no role branching at all — so the row's only remaining consumers are
the `is_admin()` RLS helper and the separate admin dashboard. It is historical
bootstrap data. Removing it, and moving role bootstrap to a seed file, is a
reasonable future cleanup and is deliberately **out of scope** here.
