# IA opcional (OpenAI) — organizar y recomendar

La IA es **opcional**. La app funciona perfecto sin ella (chips + lógica local). Cuando la actives, cada entrada/nota nueva se convierte en datos estructurados, el Perfil Vivo se actualiza y puedes pedir recomendaciones de actividades.

**Seguridad:** la clave de OpenAI NUNCA va en el navegador. Vive solo en una Edge Function de Supabase.

**Costo:** solo se analiza lo **nuevo o editado** (nunca todo el historial), se guarda el resultado para no pagar dos veces, y hay un **tope mensual** (por defecto US$50) que corta las llamadas si se alcanza.

---

## Paso 1 · Tablas y columnas (SQL)

En Supabase → **SQL Editor**, además de lo de `SUPABASE.md`, corre esto:

```sql
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
```

## Paso 2 · Instalar la CLI de Supabase

En tu computadora (una vez):

```bash
npm install -g supabase
supabase login
supabase link --project-ref TU_PROJECT_REF   # el ref sale de la URL del proyecto
```

## Paso 3 · Desplegar la Edge Function

El código ya está en `supabase/functions/emma-ai/index.ts`. Desde la carpeta del proyecto:

```bash
supabase functions deploy emma-ai
```

## Paso 4 · Guardar los secretos (la API key va aquí, no en la app)

```bash
supabase secrets set OPENAI_API_KEY=sk-tu-clave-de-openai
# Opcionales (tienen valores por defecto):
supabase secrets set AI_MONTHLY_LIMIT_USD=50
supabase secrets set OPENAI_MODEL_ANALYZE=gpt-5.4-nano
supabase secrets set OPENAI_MODEL_RECOMMEND=gpt-5.4-nano
supabase secrets set OPENAI_MODEL_WEEKLY=gpt-5.4-mini
# Precios por 1K tokens (ajústalos a tu plan de OpenAI):
supabase secrets set OPENAI_PRICE_IN=0.00005
supabase secrets set OPENAI_PRICE_OUT=0.0004
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente en la función. **Nunca** pongas la service role key en el navegador.

## Paso 5 · Activar la IA en la app

En `supabase-config.js`:

```js
AI_ENABLED: true,
AI_MONTHLY_LIMIT_USD: 50
```

Sube el archivo (si publicaste en GitHub Pages/Netlify). Listo.

---

## Cómo se usa

- **Botón “Actualizar perfil”** (en Inicio, Perfil y Ajustes): busca entradas/notas nuevas o editadas sin análisis, las manda a OpenAI (solo esas), guarda el resultado y reorganiza el Perfil Vivo. Estados: *Actualizando… → Analizando nuevas entradas… → Reorganizando perfil… → Perfil actualizado / No hay cambios / Límite de gasto alcanzado*.
- **“¿Qué hacemos hoy?”**: eliges lugar, tiempo, estado y objetivo → 3-5 actividades personalizadas según Emma. Puedes “Guardar si la hicimos” y eso vuelve a nutrir el perfil. (Sin IA, usa recomendaciones locales según sus gustos.)
- **Actualización automática**: al guardar una entrada queda como `pending`. Si la IA falla o está offline, no pasa nada: la entrada queda guardada y la reintenta el botón “Actualizar perfil”.

## Control de costo (mantenerlo < US$100/mes)

- Solo analiza lo nuevo/editado. Nunca reenvía el historial.
- Guarda cada análisis (no vuelve a pagar por lo mismo).
- Modelos económicos por defecto (nano para analizar/recomendar, mini para semanal).
- Tope mensual configurable (`AI_MONTHLY_LIMIT_USD`, por defecto 50). Al alcanzarlo, la función deja de llamar a OpenAI hasta el mes siguiente.
- En **Ajustes** ves el **gasto estimado del mes**.

## Privacidad

- La API key de OpenAI solo existe como secreto de la Edge Function.
- Solo se envía a OpenAI el texto de la entrada nueva, no todo el historial.
- Los datos siguen protegidos por tu login + RLS.
- La app nunca hace diagnóstico médico; si algo parece médico, solo sugiere “considerar consultar con pediatra”.
