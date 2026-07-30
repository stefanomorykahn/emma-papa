-- ============================================================
-- user-plans-schema.sql  ·  Plan de IA por usuario (multiusuario)
-- ai_mode: 'compartida' (usa la key del dueno gratis) | 'propia' | 'off'.
-- Solo la funcion admin (service_role) escribe; el usuario solo lee el suyo.
-- Correr en el SQL Editor de Supabase.
-- ============================================================
create table if not exists public.user_plans (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  ai_mode     text not null default 'propia',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.user_plans enable row level security;
drop policy if exists "plans_select_own" on public.user_plans;
create policy "plans_select_own" on public.user_plans for select using (auth.uid() = user_id);

-- El dueno (admin) usa la key compartida gratis:
insert into public.user_plans (user_id, ai_mode)
values ('12ff9a76-30fb-40a7-a9a1-939c7e0fff3a', 'compartida')
on conflict (user_id) do update set ai_mode = 'compartida', updated_at = now();
