-- ============================================================
-- todo-schema.sql · Emma & Papá
-- Actividades manuales del "To Do" (salidas que agrega papá).
-- Offline-first: la app siempre lee/escribe en localStorage y
-- sincroniza con esta tabla (upsert por id, borrado suave).
-- RLS por user_id = auth.uid(). Correr en el SQL Editor de Supabase.
-- (create policy NO es idempotente → se envuelve con drop policy if exists.)
-- ============================================================

create table if not exists public.emma_todo_items (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default '',
  category    text,
  address     text,
  hours       text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  deleted     boolean not null default false
);

create index if not exists emma_todo_items_user_idx on public.emma_todo_items (user_id);

alter table public.emma_todo_items enable row level security;

drop policy if exists "todo_select_own" on public.emma_todo_items;
drop policy if exists "todo_insert_own" on public.emma_todo_items;
drop policy if exists "todo_update_own" on public.emma_todo_items;
drop policy if exists "todo_delete_own" on public.emma_todo_items;

create policy "todo_select_own" on public.emma_todo_items
  for select using (auth.uid() = user_id);
create policy "todo_insert_own" on public.emma_todo_items
  for insert with check (auth.uid() = user_id);
create policy "todo_update_own" on public.emma_todo_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "todo_delete_own" on public.emma_todo_items
  for delete using (auth.uid() = user_id);
