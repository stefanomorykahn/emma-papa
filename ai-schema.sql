-- ============================================================
--  Emma & Papá · Esquema ADICIONAL para la IA (OpenAI)
--  Correr DESPUÉS de supabase-schema.sql.
--  (Columnas de control de análisis + tablas de análisis,
--   caché de perfil y control de gasto, todo con RLS.)
-- ============================================================

-- Columnas de control de análisis en entradas y notas
alter table emma_entries add column if not exists raw_text text;
alter table emma_entries add column if not exists analysis_status text default 'pending';
alter table emma_entries add column if not exists last_analyzed_at timestamptz;
alter table emma_notes   add column if not exists analysis_status text default 'pending';
alter table emma_notes   add column if not exists last_analyzed_at timestamptz;

-- Resultado del análisis de IA por entrada
create table if not exists emma_entry_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  entry_id uuid unique,
  analysis_json jsonb,
  model_used text,
  input_tokens int default 0,
  output_tokens int default 0,
  estimated_cost numeric default 0,
  created_at timestamptz not null default now()
);

-- Cache opcional del perfil calculado
create table if not exists emma_profile_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id),
  profile_json jsonb,
  updated_at timestamptz not null default now()
);

-- Registro de uso y costo de IA (control de gasto)
create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  feature text,
  model text,
  input_tokens int default 0,
  output_tokens int default 0,
  estimated_cost numeric default 0,
  created_at timestamptz not null default now()
);

-- Seguridad: cada usuario solo ve lo suyo
alter table emma_entry_analysis enable row level security;
alter table emma_profile_cache  enable row level security;
alter table ai_usage_logs       enable row level security;
create policy "ea_own" on emma_entry_analysis for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pc_own" on emma_profile_cache  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "au_own" on ai_usage_logs       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
