-- ============================================================
--  Emma & Papá · Tabla de fotos (metadata) para Supabase
--  Las imágenes viven en Google Drive; aquí solo va la metadata.
--  Habilita el "modo enlace" + sync de metadata entre dispositivos.
-- ============================================================
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
alter table emma_photos enable row level security;
create policy "photo_own" on emma_photos for all using (user_id = auth.uid()) with check (user_id = auth.uid());
