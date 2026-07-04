# Galería de fotos con Google Drive

Las **fotos** se guardan en tu carpeta de Google Drive; en Supabase solo va la **metadata** (fecha, título, tags, enlace, favorita, a qué entrada pertenece). Nada de imágenes en localStorage ni fotos públicas.

Carpeta destino (ya creada):
`Personal / Emma / 02 Fotos / Emma & Papa` · ID `1XGWN6wxXMMqBgDt189hEf6Pz7_d1poqv`

La app funciona en dos modos:

- **Modo enlace (Fase 1) — sin configurar nada.** Agregas una foto pegando su enlace de Drive; la galería la muestra con botón "Ver en Drive".
- **Modo subida (Fase 2) — subes desde el celular.** Requiere un OAuth Client ID de Google (abajo). La app sube la foto optimizada a la carpeta y muestra miniaturas dentro de la app.

---

## Paso 1 · Tabla en Supabase (SQL)

```sql
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
```

Con esto ya funciona el modo enlace + la sincronización de metadata entre dispositivos.

## Paso 2 · Subir fotos desde la app (OAuth Google Drive)

Usamos el scope **mínimo** `drive.file`: la app solo puede ver y tocar los archivos que ella misma crea. No pide acceso a todo tu Drive. No hay client secret ni tokens guardados: el permiso se pide en el momento y vive solo en memoria.

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) → crea (o elige) un proyecto.
2. **APIs & Services → Library** → habilita **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → tipo **External** → completa lo básico → agrega tu correo en **Test users** (así no necesitas verificación de Google para uso personal).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Tipo: **Web application**.
   - **Authorized JavaScript origins**: la URL donde abres la app (ej. `https://tuusuario.github.io`, y `http://localhost:...` si pruebas local).
   - Crea y copia el **Client ID**.
5. Pega el Client ID en `supabase-config.js`:

```js
GOOGLE_CLIENT_ID: '1234567890-xxxx.apps.googleusercontent.com'
```

6. En la app → **Ajustes → Google Drive → Conectar Google Drive**. Autoriza con tu cuenta. Listo: ya puedes usar "＋ Agregar foto" al registrar un momento o en la Galería.

> La carpeta destino ya está fijada por su ID. Los archivos se nombran `emma_AAAA-MM-DD_HH-mm-ss.jpg` y se suben **optimizados** (máx. 1600 px, JPEG) para no llenar tu Drive rápido.

---

## Cómo se usa

- **Al registrar un momento** → sección **Fotos → ＋ Agregar foto** (cámara o galería del celular). Las fotos quedan vinculadas a esa entrada.
- **Galería** (Home o Ajustes): grid de 2 columnas, filtros (Todas, Favoritas, Papá, Mamá, Familia, Actividades, Comida, Colegio, Natación, Recuerdos, Primera vez) y búsqueda. Toca una foto para ver el detalle: fecha, título, descripción, tags, entrada relacionada, **Ver en Drive**, Editar, Favorita, y **Quitar de la app**.
- **Quitar de la app** borra solo la metadata (la foto sigue en tu Drive). No hay borrado de Drive desde la app por seguridad.

## Miniaturas dentro de la app

Como las fotos son privadas, la miniatura se descarga de forma autorizada (con tu sesión de Drive) y se muestra en memoria. Si no estás conectado a Drive, la galería muestra un ícono y el botón "Ver en Drive". Al conectar, aparecen las miniaturas.

## Privacidad

- Fotos privadas: sin links públicos, sin analytics.
- La IA **no** procesa las imágenes; solo puede usar título, descripción, tags y la nota de la entrada.
- Scope mínimo `drive.file`. La app nunca ve el resto de tu Drive.
- No se guardan imágenes en localStorage; solo metadata.

## Fases siguientes (opcionales)

- **Subcarpetas por año/mes** dentro de `Emma & Papa` (hoy: todo en la carpeta raíz).
- **Proxy de miniaturas** vía Edge Function si algún día quieres verlas sin iniciar sesión de Drive en cada dispositivo.
- **Fotos en el Perfil Vivo** (ya existe `getPhotosForProfileItem` para traer fotos por actividad/comida/tag).
