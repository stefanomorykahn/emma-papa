-- ============================================================
--  Emma & Papá · Esquema de base de datos para Supabase
--  Pégalo COMPLETO en: Supabase → SQL Editor → New query → Run
--  (Crea las tablas + la seguridad RLS: cada usuario solo ve SUS datos)
-- ============================================================

-- Entradas del registro rápido
create table if not exists emma_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  date date,
  mood text,
  activities text[], liked_items text[], foods text[], fruits text[],
  food_result text, new_words text[], calming_things text[],
  frustrations text[], places text[], people text[],
  note text,
  analysis_status text default 'pending',
  last_analyzed_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  deleted boolean not null default false
);

-- Notas de papá
create table if not exists emma_notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  date date, text text, tags text[], is_important boolean default false,
  analysis_status text default 'pending', last_analyzed_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  deleted boolean not null default false
);

-- Items confirmados / perfil inicial (seed)
create table if not exists emma_profile_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  category text, subcategory text, name text, sentiment text,
  source text, source_id uuid, notes text,
  created_at timestamptz, updated_at timestamptz,
  deleted boolean not null default false
);

-- Seguridad: cada usuario solo ve y edita SUS datos
alter table emma_entries       enable row level security;
alter table emma_notes         enable row level security;
alter table emma_profile_items enable row level security;
-- Fotos (metadata; los archivos viven en Google Drive) — ver PHOTOS.md
create table if not exists emma_photos (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  entry_id uuid, activity_id uuid,
  date date, title text, description text, tags text[],
  storage_provider text default 'google_drive',
  drive_folder_id text, drive_file_id text, drive_url text,
  thumbnail_url text, thumbnail_updated_at timestamptz,
  mime_type text, file_name text, file_size integer,
  width integer, height integer,
  is_favorite boolean default false,
  created_at timestamptz, updated_at timestamptz,
  deleted boolean not null default false
);

-- Gastos de Emma (S/)
create table if not exists emma_expenses (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  entry_id uuid,
  date date,
  amount numeric not null default 0,
  category text,
  description text,
  receipt_photo_id uuid,
  created_at timestamptz, updated_at timestamptz,
  deleted boolean not null default false
);

-- Seguridad: cada usuario solo ve y edita SUS datos
alter table emma_photos   enable row level security;
alter table emma_expenses enable row level security;
create policy "ent_own" on emma_entries       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "not_own" on emma_notes          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pit_own" on emma_profile_items  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pho_own" on emma_photos         for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exp_own" on emma_expenses       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
