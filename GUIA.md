# Emma & Papá — Guía rápida

Una app privada y simple para registrar momentos con Emma. Todo vive en tu dispositivo.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app. Aquí pasa todo: registro rápido, nota libre, historial, perfil, backup. |
| `emma-perfil.html` | Perfil resumido de Emma (opcional, se abre solo). |
| `emma-diario.html` | Redirige a la app (el diario ya vive dentro). |
| `storage.js` | Capa de datos. Se cambia solo esto para migrar a la nube. |
| `manifest.json`, `service-worker.js`, `icon*.png/svg` | Para instalarla como app y que funcione sin internet. |

---

## 1. Cómo usarlo desde mi celular

El 80% del uso es: **abrir → tocar → seleccionar 2–3 cosas → guardar → cerrar.**

- **Registro rápido:** toca el estado de Emma y qué hicieron. Con eso ya puedes guardar. Lo demás es opcional.
- **Nota libre:** un cuadro grande para escribir (o dictar por voz con el micrófono del teclado). Ej: *"Hoy Emma dijo papá"*.
- **Perfil:** se llena solo con lo que registras — lo que más le gusta, comidas, palabras nuevas, qué la calma.

Abrir en el celular: pon los archivos en la nube (ver sección 4) y abre el enlace. Mientras tanto, funciona abriendo `index.html` en el navegador.

## 2. Cómo instalarlo como app

> Para instalar como app necesitas publicarlo con un enlace `https://` (sección 4). Desde un archivo local no se instala, pero sí se usa.

- **iPhone (Safari):** abre el enlace → botón **Compartir** (cuadro con flecha) → **Agregar a pantalla de inicio**.
- **Android (Chrome):** abre el enlace → menú **⋮** → **Agregar a pantalla principal** / **Instalar app**.

Queda con el ícono "E" y se abre a pantalla completa, como cualquier app.

## 3. Cómo registrar un momento rápido

1. Abre la app.
2. Toca **Registro rápido**.
3. Toca cómo estuvo Emma (ej. *Feliz*).
4. Toca qué hicieron (ej. *Parque*, *Cuento*).
5. (Opcional) qué le gustó, comida, una nota.
6. **Guardar**. Listo — menos de 60 segundos.

Se autoguarda mientras escribes: si cierras sin querer, no pierdes lo avanzado.

## 4. Cómo hacer backup

En la app: **💾 Backup**.

- **Exportar backup (JSON):** descarga una copia de todo. Guárdala en tus fotos/archivos o mándatela por correo.
- **Importar backup (JSON):** recupera desde una copia (útil al cambiar de teléfono).
- **Copiar resumen del día / Descargar diario / Descargar perfil:** para compartir o guardar aparte.

La app te recuerda hacer backup si pasó más de una semana. **Hazlo seguido.**

## 5. Limitación importante de localStorage

Los datos se guardan **solo en el navegador de ese dispositivo**. Eso significa:

- ✅ Privado, local, sin internet, sin terceros.
- ⚠️ **No se sincroniza** entre tu celular y tu computadora.
- ⚠️ Si borras el historial/datos del navegador o desinstalas, se pierde (por eso: **backup**).
- ⚠️ En iPhone, Safari puede borrar datos de webs que no usas por mucho tiempo. Instalarla como app ayuda; el backup lo asegura.

Regla de oro: **exporta un backup cada semana.**

## 6. Sincronizar celular y computadora (a futuro)

Hoy: para pasar datos de un lado a otro usa **Exportar** en un dispositivo e **Importar** en el otro.

Cuando quieras sincronización automática, no hay que rehacer la app: toda la lectura/escritura pasa por `storage.js`. Solo se reescriben esas funciones para que hablen con la nube.

---

## Publicarla gratis (para abrirla desde el celular)

Cualquiera de estas opciones te da un enlace `https://` gratis. **GitHub Pages** es la más simple:

**Opción A — GitHub Pages**
1. Crea una cuenta en github.com y un repositorio nuevo (ej. `emma-papa`).
2. Sube todos los archivos de esta carpeta.
3. Repo → *Settings* → *Pages* → Source: rama `main`, carpeta `/root` → *Save*.
4. En 1–2 min tendrás un enlace tipo `https://tuusuario.github.io/emma-papa/`. Ábrelo en el celular e instálalo.

**Opción B — Netlify (sin cuenta técnica)**
1. Entra a app.netlify.com → *Add new site* → *Deploy manually*.
2. Arrastra la carpeta completa. Te da un enlace al instante.

**Opción C — Vercel**
1. vercel.com → importa el repo de GitHub o sube la carpeta → *Deploy*. Enlace inmediato.

En las tres, el `https://` hace que funcione la instalación como app y el modo offline.

---

## Migrar a la nube después (Supabase / Firebase / Google Sheets)

Toda la persistencia está aislada en `storage.js`, en estas funciones:

```
getEntries, saveEntry, updateEntry, deleteEntry,
getPermanentNotes, savePermanentNotes,
exportData, importData
```

El resto de la app (index.html, perfil) **no cambia**. Para migrar:

- **Supabase (recomendado):** crea un proyecto, una tabla `entries` y una `notes`. Reemplaza el cuerpo de esas funciones por llamadas al cliente de Supabase (`supabase.from('entries').select()/insert()/update()/delete()`). Ganas sincronización entre dispositivos y login.
- **Firebase (Firestore):** igual, usando `getDocs`, `addDoc`, `updateDoc`, `deleteDoc` sobre una colección `entries`.
- **Google Sheets:** más artesanal; usa Google Apps Script como API para leer/escribir filas. Sirve si quieres los datos en una hoja de cálculo, pero es el menos robusto.

Estrategia sugerida: mantener localStorage como caché offline y sincronizar con la nube cuando haya internet (offline-first). Así la app sigue funcionando sin señal, exactamente como ahora.

---

## Privacidad

- 🔒 Los datos viven en tu dispositivo mientras uses localStorage.
- Sin analytics, sin rastreo, sin envío a terceros.
- Acceso con PIN simple: previsto para una versión futura.
