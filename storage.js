/* ============================================================
   storage.js  ·  Capa de almacenamiento de "Emma & Papá"
   ------------------------------------------------------------
   Toda la app habla con los datos SOLO a través de EmmaStore.
   Hoy guarda en localStorage. Mañana, para sincronizar con la
   nube (Supabase / Firebase / Google Sheets), basta con
   reescribir las funciones de la sección "PERSISTENCIA".
   El resto de la app no cambia.
   ============================================================ */

const EmmaStore = (function () {

  /* ---------- Claves y datos base ---------- */
  const KEY_ENTRIES = 'emmaDiaryEntries';   // array de entradas (rápidas, notas, detalladas)
  const KEY_NOTES   = 'emmaPermanentNotes';  // notas permanentes del perfil
  const KEY_META    = 'emmaMeta';            // metadatos (último backup, etc.)
  const KEY_DELETED = 'emmaDeleted';         // lápidas de borrado {id: timestamp} para sync
  const KEY_PITEMS  = 'emmaProfileItems';    // items confirmados desde notas (emma_profile_items)
  const KEY_PIDEL   = 'emmaProfileItemsDeleted';

  // Genera un UUID (compatible con columnas uuid de Supabase)
  function _uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
    });
  }

  // Se llama tras cualquier cambio local. El motor de sync (si existe)
  // lo usa para empujar cambios a la nube. Sin sync, no hace nada.
  function _notify() {
    try { if (window.EmmaSync && window.EmmaSync.onLocalChange) window.EmmaSync.onLocalChange(); }
    catch (e) {}
  }

  // Datos fijos de Emma
  const EMMA = {
    nombre: 'Emma Mory Verdi',
    nacimiento: '2024-07-17'
  };

  /* ============================================================
     PERSISTENCIA  ·  (esto es lo único que se cambia para la nube)
     ============================================================ */
  function _read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (e) { return fallback; }
  }
  function _write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // --- Entradas ---
  function getEntries() {
    return _read(KEY_ENTRIES, []);
  }
  function saveEntry(entry) {
    const entries = getEntries();
    const now = new Date().toISOString();
    entry.id = entry.id || _uuid();
    entry.createdAt = entry.createdAt || now;
    entry.updatedAt = now;
    entry.analysis_status = entry.analysis_status || 'pending'; // pendiente de análisis IA
    entry.last_analyzed_at = entry.last_analyzed_at || null;
    entries.push(entry);
    _write(KEY_ENTRIES, entries);
    _notify();
    return entry;
  }
  function updateEntry(id, patch) {
    const entries = getEntries();
    const i = entries.findIndex(e => e.id === id);
    if (i < 0) return null;
    // Al editar, la entrada vuelve a quedar pendiente de análisis
    entries[i] = { ...entries[i], ...patch, id, updatedAt: new Date().toISOString(), analysis_status: 'pending' };
    _write(KEY_ENTRIES, entries);
    _notify();
    return entries[i];
  }
  function deleteEntry(id) {
    _write(KEY_ENTRIES, getEntries().filter(e => e.id !== id));
    // Lápida: recuerda el borrado para propagarlo a la nube
    const t = getTombstones(); t[id] = new Date().toISOString(); _write(KEY_DELETED, t);
    _notify();
  }

  // --- Notas permanentes del perfil ---
  function getPermanentNotes() {
    return _read(KEY_NOTES, {});
  }
  function savePermanentNotes(obj) {
    const val = obj || {};
    if (!val.updatedAt) val.updatedAt = new Date().toISOString();
    _write(KEY_NOTES, val);
    _notify();
  }

  /* ---------- Items confirmados del perfil (emma_profile_items) ---------- */
  function getProfileItems() { return _read(KEY_PITEMS, []); }
  function saveProfileItem(item) {
    const arr = getProfileItems();
    const now = new Date().toISOString();
    item.id = item.id || _uuid();
    item.createdAt = item.createdAt || now;
    item.updatedAt = now;
    arr.push(item);
    _write(KEY_PITEMS, arr);
    _notify();
    return item;
  }
  function deleteProfileItem(id) {
    _write(KEY_PITEMS, getProfileItems().filter(i => i.id !== id));
    const t = getPiTombstones(); t[id] = new Date().toISOString(); _write(KEY_PIDEL, t);
    _notify();
  }
  function getPiTombstones() { return _read(KEY_PIDEL, {}); }
  function setPiTombstones(o) { _write(KEY_PIDEL, o || {}); }
  function _setProfileItemsRaw(arr) { _write(KEY_PITEMS, arr || []); }

  /* ---------- Análisis de IA (emma_entry_analysis, espejo local) ---------- */
  const KEY_ANALYSES = 'emmaAnalyses';
  function getAnalyses() { return _read(KEY_ANALYSES, []); }
  // Upsert por entryId: reemplaza el análisis anterior de esa entrada
  function saveAnalysis(entryId, analysisJson, meta) {
    const arr = getAnalyses().filter(a => a.entryId !== entryId);
    arr.push(Object.assign({ id: _uuid(), entryId, analysis_json: analysisJson,
      createdAt: new Date().toISOString() }, meta || {}));
    _write(KEY_ANALYSES, arr);
    // marca la entrada como analizada
    const e = getEntries(); const i = e.findIndex(x => x.id === entryId);
    if (i >= 0) { e[i].analysis_status = 'analyzed'; e[i].last_analyzed_at = new Date().toISOString(); _write(KEY_ENTRIES, e); }
    return arr;
  }
  function markEntryStatus(entryId, status) {
    const e = getEntries(); const i = e.findIndex(x => x.id === entryId);
    if (i >= 0) { e[i].analysis_status = status; _write(KEY_ENTRIES, e); }
  }
  function _setAnalysesRaw(arr) { _write(KEY_ANALYSES, arr || []); }

  /* ---------- Fotos (metadata; los archivos viven en Google Drive) ---------- */
  const KEY_PHOTOS = 'emmaPhotos';
  const KEY_PH_DEL = 'emmaPhotosDeleted';
  function getPhotos() { return _read(KEY_PHOTOS, []); }
  function savePhoto(p) {
    const arr = getPhotos(); const now = new Date().toISOString();
    p.id = p.id || _uuid(); p.createdAt = p.createdAt || now; p.updatedAt = now;
    arr.push(p); _write(KEY_PHOTOS, arr); _notify(); return p;
  }
  function updatePhoto(id, patch) {
    const arr = getPhotos(); const i = arr.findIndex(x => x.id === id);
    if (i < 0) return null;
    arr[i] = { ...arr[i], ...patch, id, updatedAt: new Date().toISOString() };
    _write(KEY_PHOTOS, arr); _notify(); return arr[i];
  }
  function deletePhoto(id) {
    _write(KEY_PHOTOS, getPhotos().filter(x => x.id !== id));
    const t = getPhTombstones(); t[id] = new Date().toISOString(); _write(KEY_PH_DEL, t);
    _notify();
  }
  function getPhTombstones() { return _read(KEY_PH_DEL, {}); }
  function setPhTombstones(o) { _write(KEY_PH_DEL, o || {}); }
  function _setPhotosRaw(arr) { _write(KEY_PHOTOS, arr || []); }

  /* ---------- Helpers de sincronización (usados por supabase-sync.js) ---------- */
  function getTombstones() { return _read(KEY_DELETED, {}); }
  function setTombstones(obj) { _write(KEY_DELETED, obj || {}); }
  // Escritura directa SIN notificar (para aplicar cambios que vienen de la nube)
  function _setEntriesRaw(arr) { _write(KEY_ENTRIES, arr || []); }
  function _setNotesRaw(obj) { _write(KEY_NOTES, obj || {}); }
  function uuid() { return _uuid(); }

  // --- Metadatos ---
  function getMeta() { return _read(KEY_META, {}); }
  function setMeta(patch) { _write(KEY_META, { ...getMeta(), ...patch }); }

  /* ============================================================
     BACKUP  ·  exportar / importar (funciona bien en celular)
     ============================================================ */
  function exportData() {
    return {
      app: 'Emma & Papá',
      version: 1,
      emmaDiaryEntries: getEntries(),
      emmaPermanentNotes: getPermanentNotes(),
      exportadoEl: new Date().toISOString()
    };
  }
  function importData(data, { reemplazar = true } = {}) {
    const entradas = Array.isArray(data) ? data : (data.emmaDiaryEntries || []);
    if (!Array.isArray(entradas)) throw new Error('Formato no válido');
    if (reemplazar) {
      _write(KEY_ENTRIES, entradas);
    } else {
      // Fusionar sin duplicar por id
      const actuales = getEntries();
      const ids = new Set(actuales.map(e => e.id));
      entradas.forEach(e => { if (!ids.has(e.id)) actuales.push(e); });
      _write(KEY_ENTRIES, actuales);
    }
    if (data.emmaPermanentNotes) savePermanentNotes(data.emmaPermanentNotes);
    return getEntries().length;
  }
  function clearAll() {
    localStorage.removeItem(KEY_ENTRIES);
    localStorage.removeItem(KEY_NOTES);
    localStorage.removeItem(KEY_META);
    localStorage.removeItem(KEY_DELETED);
    localStorage.removeItem(KEY_PITEMS);
    localStorage.removeItem(KEY_PIDEL);
    localStorage.removeItem('emmaProfileData');
    localStorage.removeItem('emmaNotes');
    localStorage.removeItem('emmaNotesDeleted');
    localStorage.removeItem(KEY_ANALYSES);
    localStorage.removeItem(KEY_PHOTOS);
    localStorage.removeItem(KEY_PH_DEL);
    localStorage.removeItem('emmaSeeded');
  }

  /* ============================================================
     DERIVADOS Y ANÁLISIS  ·  (funciones puras, no tocan storage)
     El perfil se "nutre" del diario usando estas funciones.
     ============================================================ */

  // Edad de Emma en texto (años y meses)
  function edadEmma() {
    const nac = new Date(EMMA.nacimiento + 'T00:00:00');
    const hoy = new Date();
    let meses = (hoy.getFullYear() - nac.getFullYear()) * 12 + (hoy.getMonth() - nac.getMonth());
    if (hoy.getDate() < nac.getDate()) meses--;
    const años = Math.floor(meses / 12);
    const m = meses % 12;
    const pa = años === 1 ? '1 año' : años + ' años';
    const pm = m === 1 ? '1 mes' : m + ' meses';
    if (años <= 0) return pm;
    return m === 0 ? pa : pa + ' y ' + pm;
  }

  // Listas de referencia para "leer" notas libres sin obligar a ordenar
  const ACTIVIDADES = ['Parque','Cuento','Música','Baile','Comida juntos','Oración','Bloques',
                        'Playa','Caminar','Videollamada','Juego libre','Baño','Siesta','Dibujar','Cantar','Agua'];
  const COMIDAS = ['Fruta','Pollo','Arroz','Pasta','Huevo','Yogurt','Pan','Verduras','Sopa','Plátano','Leche','Avena'];

  // Cuenta frecuencia de un campo (string o array) en todas las entradas
  function _contar(getter) {
    const conteo = {};
    getEntries().forEach(e => {
      let vals = getter(e);
      if (!vals) return;
      if (!Array.isArray(vals)) vals = String(vals).split(/[,;]+/);
      vals.map(v => String(v).trim()).filter(Boolean).forEach(v => {
        const k = v.charAt(0).toUpperCase() + v.slice(1);
        conteo[k] = (conteo[k] || 0) + 1;
      });
    });
    return conteo;
  }

  // Escanea texto libre buscando palabras de una lista de referencia
  function _escanearTexto(lista) {
    const conteo = {};
    const textos = getEntries()
      .map(e => [e.freeText, e.notes, e.tenderMoment].filter(Boolean).join(' ').toLowerCase())
      .join(' ');
    lista.forEach(item => {
      const re = new RegExp('\\b' + item.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const n = (textos.match(re) || []).length;
      if (n > 0) conteo[item] = n;
    });
    return conteo;
  }

  // Fusiona dos conteos
  function _fusionar(a, b) {
    const r = { ...a };
    Object.keys(b).forEach(k => r[k] = (r[k] || 0) + b[k]);
    return r;
  }

  // Ordena un conteo a lista [{nombre, veces}]
  function _top(conteo, n) {
    return Object.entries(conteo)
      .sort((x, y) => y[1] - x[1])
      .slice(0, n || 99)
      .map(([nombre, veces]) => ({ nombre, veces }));
  }

  // Actividades favoritas (campos + notas libres)
  function actividadesFavoritas(n) {
    const c = _fusionar(
      _fusionar(_contar(e => e.activities), _contar(e => e.favoriteActivity)),
      _escanearTexto(ACTIVIDADES)
    );
    return _top(c, n);
  }
  // Comidas que más acepta
  function comidasFavoritas(n) {
    const c = _fusionar(
      _fusionar(_contar(e => e.foods), _contar(e => e.favoriteFood)),
      _escanearTexto(COMIDAS)
    );
    return _top(c, n);
  }
  // Lugares favoritos
  function lugaresFavoritos(n) { return _top(_contar(e => e.place), n); }

  // Últimas palabras nuevas (de campo o de notas con patrón "dijo X")
  function palabrasNuevas(n) {
    const out = [];
    getEntries()
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .forEach(e => {
        if (e.newWords) out.push({ palabra: e.newWords, date: e.date });
        const txt = [e.freeText, e.notes].filter(Boolean).join(' ');
        const m = txt.match(/dijo[^"'\wáéíóúñ]*["']?([\wáéíóúñ ]{2,20})/i);
        if (m) out.push({ palabra: m[1].trim(), date: e.date });
      });
    return out.slice(0, n || 20);
  }

  // Lista simple de valores no vacíos de un campo (recientes primero)
  function ultimosDe(campo, n) {
    return getEntries()
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(e => e[campo] && ({ texto: e[campo], date: e.date }))
      .filter(Boolean)
      .slice(0, n || 10);
  }

  // Estado emocional más frecuente
  function emocionFrecuente() {
    const c = _contar(e => e.emotionalState);
    const t = _top(c, 1);
    return t.length ? t[0].nombre : '';
  }

  // Racha de días consecutivos con registro (hasta hoy)
  function racha() {
    const dias = new Set(getEntries().map(e => e.date));
    if (dias.size === 0) return 0;
    let r = 0;
    const d = new Date();
    for (;;) {
      const iso = d.toISOString().slice(0, 10);
      if (dias.has(iso)) { r++; d.setDate(d.getDate() - 1); }
      else if (r === 0 && iso === new Date().toISOString().slice(0, 10)) {
        d.setDate(d.getDate() - 1); // permite que hoy aún no tenga registro
      } else break;
    }
    return r;
  }

  // Última entrada registrada
  function ultimaEntrada() {
    const e = getEntries().slice().sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    return e[0] || null;
  }

  /* ---------- API pública ---------- */
  return {
    EMMA,
    // persistencia
    getEntries, saveEntry, updateEntry, deleteEntry,
    getPermanentNotes, savePermanentNotes,
    getMeta, setMeta,
    exportData, importData, clearAll,
    // items confirmados del perfil
    getProfileItems, saveProfileItem, deleteProfileItem,
    // análisis de IA
    getAnalyses, saveAnalysis, markEntryStatus, _setAnalysesRaw,
    // fotos (metadata)
    getPhotos, savePhoto, updatePhoto, deletePhoto, getPhTombstones, setPhTombstones, _setPhotosRaw,
    // helpers de sync
    getTombstones, setTombstones, _setEntriesRaw, _setNotesRaw,
    getPiTombstones, setPiTombstones, _setProfileItemsRaw, uuid,
    // derivados
    edadEmma, actividadesFavoritas, comidasFavoritas, lugaresFavoritos,
    palabrasNuevas, ultimosDe, emocionFrecuente, racha, ultimaEntrada,
    ACTIVIDADES, COMIDAS
  };
})();

// Compatibilidad con posibles imports futuros
if (typeof window !== 'undefined') window.EmmaStore = EmmaStore;
