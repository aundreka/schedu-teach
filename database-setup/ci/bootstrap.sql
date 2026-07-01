-- CI bootstrap: minimal stand-ins for the Supabase-managed objects that the
-- numbered migrations assume already exist (auth schema, storage schema, the
-- auth.* helper functions, and the anon/authenticated/service_role roles).
--
-- This lets a plain Postgres container apply database-setup/00..12 in CI to
-- prove a clean cutover. It is NOT a substitute for real Supabase; it only
-- creates enough surface for the DDL/RLS to apply without error.
--
-- Run before apply.sh in CI. Never run against a real Supabase project.

create extension if not exists pgcrypto;

-- Roles Supabase ships with.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- auth schema + a minimal users table the public.users FK and trigger target.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz not null default now()
);

-- auth.* helpers used inside RLS policies. In real Supabase these read the JWT;
-- in CI they return NULL/empty, which is fine for an apply-only check.
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

-- storage schema + the objects the user-avatar policies reference.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

alter table storage.objects enable row level security;
