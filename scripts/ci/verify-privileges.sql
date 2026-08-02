-- Privilege-parity gate for the LOCAL database rebuilt from migrations.
--
-- The migration chain shipped for its whole life without table or function
-- GRANTs: it applied cleanly and produced a database the API roles could not
-- read, because it was authored on top of a permissive default the hosted
-- project has and a fresh one does not. Migration 0030 restores that baseline.
-- This script is what stops it regressing.
--
-- The expected function map below was MEASURED against the hosted project
-- read-only, then reproduced locally. It is deliberately non-uniform: 0018,
-- 0020 and 0029 revoke execute on privileged internals, and those revokes must
-- survive. Anything that widens them fails here.
--
-- Run with ON_ERROR_STOP=1 so a RAISE fails the job.

\set ON_ERROR_STOP on

/* ── 1. Every migration applied ─────────────────────────────────────────────
   Asserted by the workflow step BEFORE this script, not here.

   This block used to hard-code the total (30, then 33). SQL cannot see the
   migrations directory, so any number written here is a copy of a fact that
   lives on disk — and copies go stale: the workflow's own copy said 30 while
   this one said 33, and the first run of the pipeline failed on exactly that
   disagreement.

   The check itself did not go away. `Assert every migration applied` runs the
   same `count(*) from supabase_migrations.schema_migrations`, against the same
   database, moments earlier — and compares it to the number of .sql files
   actually present, so migration 0034 needs no edit anywhere.

   What remains below is what this script is FOR: privilege parity, which
   cannot be derived from the filesystem. */

/* ── 2. RLS enabled on every public table ───────────────────────────────── */
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into missing
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if missing is not null then
    raise exception 'tables without RLS: %', missing;
  end if;
  raise notice 'OK  RLS enabled on every public table';
end $$;

/* ── 3. Table privileges: all 7 for all 3 API roles, no exceptions ──────── */
do $$
declare missing text;
begin
  with expected as (
    select t.table_name, r.grantee, p.priv
    from information_schema.tables t
    cross join (values ('anon'), ('authenticated'), ('service_role')) as r(grantee)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                       ('REFERENCES'), ('TRIGGER'), ('TRUNCATE')) as p(priv)
    where t.table_schema = 'public'
  )
  select string_agg(e.grantee || '.' || e.table_name || '.' || e.priv, ', ') into missing
  from expected e
  left join information_schema.role_table_grants g
    on g.table_schema = 'public'
   and g.table_name = e.table_name
   and g.grantee = e.grantee
   and g.privilege_type = e.priv
  where g.privilege_type is null;

  if missing is not null then
    raise exception 'missing table privileges: %', missing;
  end if;
  raise notice 'OK  table privileges complete for anon/authenticated/service_role';
end $$;

/* ── 4. Default privileges, so migrations 0031+ inherit the same baseline ─ */
do $$
declare acl text;
begin
  select d.defaclacl::text into acl
  from pg_default_acl d
  join pg_namespace ns on ns.oid = d.defaclnamespace
  where ns.nspname = 'public'
    and pg_get_userbyid(d.defaclrole) = 'postgres'
    and d.defaclobjtype = 'r';

  if acl is null then
    raise exception 'no default table ACL for role postgres in schema public';
  end if;

  if position('anon=arwdDxtm' in acl) = 0
     or position('authenticated=arwdDxtm' in acl) = 0
     or position('service_role=arwdDxtm' in acl) = 0 then
    raise exception 'default table ACL does not grant full privileges to the api roles: %', acl;
  end if;
  raise notice 'OK  default table privileges match the hosted baseline';
end $$;

/* ── 5. Function EXECUTE map matches the measured hosted state exactly ──── */
do $$
declare diff text;
begin
  with expected(proname, roles) as (
    values
      ('call_minutes_used_this_month', 'service_role'),
      ('handle_new_user',              'service_role'),
      ('is_admin',                     'anon,authenticated,service_role'),
      ('is_doctor',                    'anon,authenticated,service_role'),
      ('is_my_patient',                'anon,authenticated,service_role'),
      ('lock_features_for_new_user',   'service_role'),
      ('my_call_minutes_left',         'authenticated,service_role'),
      ('my_usage_status',              'anon,authenticated,service_role'),
      ('protect_profile_fields',       'service_role'),
      ('redeem_promo_code',            'authenticated,service_role'),
      ('touch_last_seen',              'anon,authenticated,service_role'),
      ('touch_updated_at',             'anon,authenticated,service_role'),
      ('unlink_my_doctor',             'authenticated,service_role'),
      ('upsert_product',               'anon,authenticated,service_role'),
      ('usage_check',                  'service_role'),
      ('usage_period_start',           'anon,authenticated,service_role'),
      ('usage_status',                 'anon,authenticated,service_role'),
      ('usage_used',                   'service_role')
  ),
  actual as (
    select p.proname::text as proname,
           coalesce(string_agg(distinct g.grantee, ',' order by g.grantee), '(none)') as roles
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    left join information_schema.role_routine_grants g
      on g.specific_schema = 'public'
     and g.routine_name = p.proname
     and g.privilege_type = 'EXECUTE'
     and g.grantee in ('anon', 'authenticated', 'service_role')
    where ns.nspname = 'public'
    group by p.proname
  )
  select string_agg(
           coalesce(e.proname, a.proname) || ': expected [' ||
           coalesce(e.roles, '<absent>') || '] got [' || coalesce(a.roles, '<absent>') || ']',
           E'\n    ' order by coalesce(e.proname, a.proname))
    into diff
  from expected e
  full outer join actual a on a.proname = e.proname
  where e.roles is distinct from a.roles;

  if diff is not null then
    raise exception E'function EXECUTE grants diverge from the hosted baseline:\n    %', diff;
  end if;
  raise notice 'OK  function EXECUTE grants match the hosted baseline';
end $$;

\echo 'privilege parity: PASS'
