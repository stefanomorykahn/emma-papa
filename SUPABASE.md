# Sincronizar Emma & Papá con Supabase (gratis)

Con esto, los datos de Emma se sincronizan entre tu celular y tu computadora. La app sigue funcionando **sin internet**: guarda local y sincroniza cuando hay señal.

Tiempo estimado: ~10 minutos, una sola vez.

---

## Paso 1 · Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (gratis).
2. **New project**. Ponle un nombre (ej. `emma-papa`), una contraseña de base de datos (guárdala) y una región cercana.
3. Espera 1–2 min a que se cree.

## Paso 2 · Crear las tablas

En el menú lateral: **SQL Editor** → **New query** → pega esto y dale **Run**:

```sql
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
create policy "ent_own" on emma_entries       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "not_own" on emma_notes          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pit_own" on emma_profile_items  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

> ¿Vas a usar la IA? Después corre también el SQL de `AI.md` (tablas de análisis, cache y control de gasto).

## Paso 3 · Crear TU usuario (y cerrar el registro público)

1. Menú **Authentication** → **Users** → **Add user** → escribe tu correo y una contraseña. Marca que quede confirmado.
2. Menú **Authentication** → **Providers** (o **Sign In / Providers**) → asegúrate de que **Email** esté activado.
3. Importante para privacidad: en **Authentication → Sign In / Providers** (o **Settings**), **desactiva "Allow new users to sign up"**. Así solo tú puedes entrar.

## Paso 4 · Copiar tus claves

Menú **Project Settings** → **API**. Copia:

- **Project URL** → ej. `https://abcdxyz.supabase.co`
- **Project API keys → `anon` `public`** → una clave larga que empieza con `eyJ...`

> Usa la clave **anon public**, NO la `service_role` (esa es secreta, nunca va en el navegador).

## Paso 5 · Pegar las claves en la app

Abre el archivo **`supabase-config.js`** y complétalo:

```js
window.SUPABASE_CONFIG = {
  SUPABASE_URL:      'https://abcdxyz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...tu-clave-anon...'
};
```

Guarda. Si publicaste la app (GitHub Pages/Netlify), sube el archivo actualizado.

## Paso 6 · Usar

1. Abre la app. Ahora pedirá **iniciar sesión** con el correo y contraseña del Paso 3.
2. Entra una vez por dispositivo (la sesión queda guardada).
3. Listo: cada registro se sincroniza. En **Backup** verás el estado ("Sincronizado ✓"), la última sync y un botón **Sincronizar ahora**.

Repite el login en tu computadora con la misma cuenta y verás los mismos datos.

---

## Cómo funciona la sincronización

- Guarda **siempre local primero** (rápido, offline).
- Al haber internet, sube tus cambios y baja los de otros dispositivos.
- Si editas lo mismo en dos lados, **gana el cambio más reciente** (por fecha).
- Los borrados se propagan (no reaparecen).
- Todo pasa por `storage.js` + `supabase-sync.js`; el resto de la app no cambia.

## Límites del plan gratis (importante)

- Base de datos 500 MB y 2 proyectos gratis: de sobra para esto (años de registros de Emma).
- **El proyecto se "pausa" tras ~1 semana sin uso.** Al volver a entrar se reactiva solo (puede tardar ~1 min la primera carga). Si lo usas seguido, no se pausa.
- Si algún día se pausa y tú estabas offline, no pasa nada: tus datos siguen en el dispositivo y se suben cuando reactive.

## Seguridad y privacidad

- La clave `anon` es pública por diseño, pero **RLS + tu login** hacen que solo tú accedas a los datos de Emma.
- Sin analytics, sin terceros.
- Sigue haciendo **backup JSON** de vez en cuando (botón en la app): es tu red de seguridad definitiva.

## Volver a modo 100% local

¿No quieres nube? Deja `supabase-config.js` con los campos vacíos (`''`). La app vuelve a ser totalmente local, sin login. Nada se pierde.
