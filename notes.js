/* ============================================================
   notes.js  ·  "Notas de papá"  (emma_notes)
   ------------------------------------------------------------
   Espacio de texto libre para observaciones más largas.
   Guarda en localStorage 'emmaNotes' y se sincroniza con Supabase.
   Estructura: { id, date, text, tags:[], isImportant, linkedEntryId, createdAt, updatedAt }
   ============================================================ */
const EmmaNotes = (function () {
  const KEY = 'emmaNotes';
  const KEY_DEL = 'emmaNotesDeleted';

  // Tags disponibles (opcionales)
  const TAGS = ['Alimentación','Sueño','Lenguaje','Juego','Emociones','Salud','Rutina',
                'Mamá','Papá','Familia','Dios / fe','Colegio','Dudas','Importante'];

  function _read(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch (e) { return f; } }
  function _write(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function _notify() { try { if (window.EmmaSync && EmmaSync.onLocalChange) EmmaSync.onLocalChange(); } catch (e) {} }

  function getNotes() {
    return _read(KEY, []).slice().sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  function saveNote(note) {
    const arr = _read(KEY, []);
    const now = new Date().toISOString();
    note.id = note.id || (EmmaStore.uuid ? EmmaStore.uuid() : ('n_' + Date.now()));
    note.tags = note.tags || [];
    note.isImportant = note.isImportant || (note.tags || []).includes('Importante');
    note.createdAt = note.createdAt || now;
    note.updatedAt = now;
    note.analysis_status = note.analysis_status || 'pending';
    note.last_analyzed_at = note.last_analyzed_at || null;
    arr.push(note);
    _write(KEY, arr);
    _notify();
    return note;
  }
  function updateNote(id, patch) {
    const arr = _read(KEY, []);
    const i = arr.findIndex(n => n.id === id);
    if (i < 0) return null;
    arr[i] = Object.assign({}, arr[i], patch, { id, updatedAt: new Date().toISOString() });
    arr[i].isImportant = arr[i].isImportant || (arr[i].tags || []).includes('Importante');
    if (!patch || !patch.analysis_status) arr[i].analysis_status = 'pending'; // editada -> reanalizar
    _write(KEY, arr);
    _notify();
    return arr[i];
  }
  function markStatus(id, status) {
    const arr = _read(KEY, []); const i = arr.findIndex(n => n.id === id);
    if (i >= 0) { arr[i].analysis_status = status; arr[i].last_analyzed_at = new Date().toISOString(); _write(KEY, arr); }
  }
  function deleteNote(id) {
    _write(KEY, _read(KEY, []).filter(n => n.id !== id));
    const t = getTombstones(); t[id] = new Date().toISOString(); _write(KEY_DEL, t);
    _notify();
  }

  // Sync helpers
  function getTombstones() { return _read(KEY_DEL, {}); }
  function setTombstones(o) { _write(KEY_DEL, o || {}); }
  function _setRaw(arr) { _write(KEY, arr || []); }

  /* ---------- Exportar / para Claude ---------- */
  function fechaCorta(iso) {
    if (!iso) return '';
    const [a, m, d] = String(iso).split('-').map(Number);
    if (!a) return iso;
    return new Date(a, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function exportJSON() { return { emmaNotes: getNotes(), exportadoEl: new Date().toISOString() }; }
  function exportMarkdown() {
    const notes = getNotes();
    let md = '# Notas sobre Emma\n\n';
    notes.forEach(n => {
      md += `## ${fechaCorta(n.date)}${n.isImportant ? ' ⭐' : ''}\n`;
      if (n.tags && n.tags.length) md += `*Tags: ${n.tags.join(', ')}*\n\n`;
      md += n.text + '\n\n';
    });
    return md;
  }
  function copyForClaude() {
    const notes = getNotes();
    let t = 'Estas son mis notas de observación sobre mi hija Emma. ';
    t += 'Léelas y ayúdame a organizar y entender mejor sus gustos, patrones y necesidades.\n\n';
    notes.forEach(n => {
      t += `[${fechaCorta(n.date)}]${n.tags && n.tags.length ? ' (' + n.tags.join(', ') + ')' : ''}: ${n.text}\n`;
    });
    return t;
  }
  function summary() {
    const notes = getNotes();
    const porTag = {};
    notes.forEach(n => (n.tags || []).forEach(tg => porTag[tg] = (porTag[tg] || 0) + 1));
    let t = `Resumen de notas (${notes.length})\n`;
    Object.entries(porTag).sort((a, b) => b[1] - a[1]).forEach(([tg, c]) => t += `- ${tg}: ${c}\n`);
    const imp = notes.filter(n => n.isImportant);
    if (imp.length) { t += `\nImportantes:\n`; imp.slice(0, 10).forEach(n => t += `• ${n.text}\n`); }
    return t;
  }

  return { TAGS, getNotes, saveNote, updateNote, deleteNote, markStatus,
    getTombstones, setTombstones, _setRaw,
    exportJSON, exportMarkdown, copyForClaude, summary };
})();
if (typeof window !== 'undefined') window.EmmaNotes = EmmaNotes;
