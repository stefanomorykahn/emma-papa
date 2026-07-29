-- ============================================================
-- child-settings-schema.sql · Multiusuario
-- Ajustes del nino/a por usuario (nombre, genero, fecha de nacimiento).
-- 1 fila por usuario (id = user_id). RLS por auth.uid().
-- Correr en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.child_settings (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default '',
  gender      text default 'nina',
  birthdate   date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  deleted     boolean not null default false
);

alter table public.child_settings enable row level security;

drop policy if exists "child_select_own" on public.child_settings;
drop policy if exists "child_insert_own" on public.child_settings;
drop policy if exists "child_update_own" on public.child_settings;
drop policy if exists "child_delete_own" on public.child_settings;

create policy "child_select_own" on public.child_settings
  for select using (auth.uid() = user_id);
create policy "child_insert_own" on public.child_settings
  for insert with check (auth.uid() = user_id);
create policy "child_update_own" on public.child_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "child_delete_own" on public.child_settings
  for delete using (auth.uid() = user_id);
