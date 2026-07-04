# Emma & Papá 🤍

Memoria viva y privada de Emma: registrar momentos, comidas y notas desde el celular; la app organiza sola su Perfil Vivo, recomienda actividades y guarda fotos en Google Drive.

Solo HTML + JavaScript vanilla (sin frameworks, sin build). Funciona offline y, opcionalmente, sincroniza con Supabase, usa IA (OpenAI) y guarda fotos en Google Drive.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app completa (todas las pantallas). |
| `emma-perfil.html` | Perfil de Emma en página aparte (opcional). |
| `emma-diario.html` | Redirige a la app. |
| `storage.js` | Datos locales (localStorage) + espejo de sync. |
| `notes.js` | Notas de papá. |
| `profile.js` | Motor del "Perfil Vivo". |
| `seed.js` | Perfil inicial de Emma (gustos ya conocidos). |
| `activities-bank.js` | Banco de actividades para "¿Qué hacemos hoy?". |
| `supabase-config.js` | **Único archivo de configuración** (claves y flags). |
| `supabase-sync.js` | Sincronización con Supabase (offline-first). |
| `ai.js` + `supabase/functions/emma-ai/` | IA opcional (OpenAI vía Edge Function). |
| `photos.js` | Galería + Google Drive. |
| `manifest.json`, `service-worker.js`, `icon*` | PWA instalable + offline. |
| `GUIA.md` · `SUPABASE.md` · `AI.md` · `PHOTOS.md` | Guías de uso y despliegue. |

Toda la configuración vive en **`supabase-config.js`**. No hace falta tocar nada más.

---

## Orden de despliegue (recomendado)

### 1. Publicar la app (obligatorio) → enlace `https://` para el celular
- **Opción fácil:** [Netlify](https://app.netlify.com) → *Add new site → Deploy manually* → arrastra esta carpeta.
- **Con GitHub:** sube la carpeta a un repo → *Settings → Pages → Deploy from branch (main / root)*.

Con esto la app ya funciona e se instala en el celular (local, sin sync). Detalle en `GUIA.md`.

### 2. Sincronizar entre dispositivos (recomendado) → Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → corre el SQL de `SUPABASE.md` (tablas + seguridad RLS).
3. **Authentication → Users** → crea tu usuario; desactiva el registro público.
4. **Project Settings → API** → copia *Project URL* y *anon public*.
5. Pégalos en `supabase-config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) y vuelve a publicar.
6. En la app: **Ajustes → Iniciar sesión**.

### 3. IA (opcional) → organizar y recomendar con OpenAI
Sigue `AI.md`: corre su SQL, `supabase functions deploy emma-ai`, `supabase secrets set OPENAI_API_KEY=...`, y pon `AI_ENABLED: true`. Tope de gasto por defecto US$50/mes.

### 4. Fotos: subir desde la app (opcional) → Google Drive
Sigue `PHOTOS.md`: corre el SQL de `emma_photos`, crea un OAuth Client ID de Google (scope mínimo `drive.file`) y ponlo en `GOOGLE_CLIENT_ID`. La carpeta de Drive ya está fijada por su ID. Sin esto, la galería funciona pegando enlaces de Drive.

---

## Seguridad (importante)

- La `anon key` de Supabase es **pública por diseño**; los datos quedan protegidos por tu **login + RLS**. Es seguro subirla a GitHub.
- **Nunca** subas la `service_role` de Supabase ni la `OPENAI_API_KEY`: esas viven solo como *secrets* de la Edge Function.
- Google Drive usa scope mínimo `drive.file` (la app solo ve lo que ella crea). No hay client secret en el frontend.

---

## Prompt para pegar en Claude Code

> Ayúdame a desplegar la app **Emma & Papá** (está en esta carpeta, es HTML/JS estático).
> 1) Publícala con enlace https (GitHub Pages o Netlify) para poder abrirla e instalarla en mi celular.
> 2) Crea el proyecto de Supabase y corre el SQL de `SUPABASE.md` (tablas + RLS), ayúdame a crear mi usuario y a pegar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `supabase-config.js`.
> 3) Cuando eso funcione, guíame para activar la IA (`AI.md`) y la subida de fotos a Google Drive (`PHOTOS.md`).
> Prioriza que quede simple y usable desde el celular. No expongas claves privadas en el frontend.

---

## Estado actual

MVP completo y probado en lógica: registro rápido, comidas, notas, perfil vivo (con seed + IA opcional), historial con filtros, "¿Qué hacemos hoy?" (banco local + IA), galería de fotos (Drive), backup/exportar, PWA offline y sync offline-first. Falta solo el despliegue (pasos de arriba), que se hace con tus cuentas.
