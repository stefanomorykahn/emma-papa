/* ============================================================
   ai.js  ·  Capa de IA OPCIONAL de "Emma & Papá"
   ------------------------------------------------------------
   - Toda llamada a OpenAI pasa por una Edge Function segura de
     Supabase (nunca la API key en el navegador). Ver AI.md.
   - Es OPCIONAL: si AI_ENABLED está en false o no hay sesión,
     la app funciona igual y las recomendaciones usan lógica local.
   - Control de costo: la Edge Function registra uso y aplica un
     tope mensual; el cliente solo muestra el gasto estimado.
   ============================================================ */
const EmmaAI = (function () {
  const C = window.SUPABASE_CONFIG || {};
  const AI_ENABLED = !!C.AI_ENABLED;
  const MAX_BATCH = 10; // máximo de entradas nuevas por "Actualizar perfil"

  function enabled() { return AI_ENABLED && window.EmmaSync && EmmaSync.configured && EmmaSync.isSignedIn(); }
  function endpoint() { return EmmaSync.urlBase() + '/functions/v1/emma-ai'; }

  async function callAI(action, payload) {
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { apikey: EmmaSync.anonKey(), Authorization: 'Bearer ' + EmmaSync.accessToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    const d = await r.json().catch(() => ({}));
    if (typeof d.month_spend === 'number') EmmaStore.setMeta({ aiMonthSpend: d.month_spend });
    if (!r.ok || d.error) { const e = new Error(d.error || ('HTTP ' + r.status)); e.blocked = d.blocked || r.status === 402; throw e; }
    return d;
  }

  /* ---------- Texto de una entrada para analizar ---------- */
  function buildEntryText(e) {
    if (e.text || e.freeText) return e.text || e.freeText;
    const p = [];
    if (e.mood) p.push('Estado: ' + e.mood + '.');
    if ((e.activities || []).length) p.push('Hicimos: ' + e.activities.join(', ') + '.');
    if ((e.liked || []).length) p.push('Le gustó: ' + e.liked.join(', ') + '.');
    if ((e.foods || []).length) p.push('Comió: ' + e.foods.join(', ') + (e.food_result ? ' (' + e.food_result + ')' : '') + '.');
    if ((e.newWords || []).length) p.push('Palabra nueva: ' + e.newWords.join(', ') + '.');
    if (e.note) p.push(e.note);
    return p.join(' ');
  }

  /* ---------- Pendientes (nuevas o editadas, sin análisis) ---------- */
  function getPendingEntriesForAnalysis() {
    const out = [];
    EmmaStore.getEntries().forEach(e => { if (e.analysis_status !== 'analyzed') out.push({ kind: 'entry', id: e.id, date: e.date, text: buildEntryText(e) }); });
    (window.EmmaNotes ? EmmaNotes.getNotes() : []).forEach(n => { if (n.analysis_status !== 'analyzed' && (n.text || '').trim()) out.push({ kind: 'note', id: n.id, date: n.date, text: n.text }); });
    return out.filter(p => (p.text || '').trim());
  }

  async function analyzeEntryWithAI(p) {
    const d = await callAI('analyze', { id: p.id, text: p.text, date: p.date });
    saveEntryAnalysis(p.id, d.analysis, { model_used: d.model, input_tokens: d.input_tokens, output_tokens: d.output_tokens, estimated_cost: d.estimated_cost });
    if (p.kind === 'note') EmmaNotes.markStatus(p.id, 'analyzed');
    return d;
  }
  function saveEntryAnalysis(entryId, analysisJson, meta) { EmmaStore.saveAnalysis(entryId, analysisJson, meta); }

  /* ---------- Botón "Actualizar perfil" ---------- */
  async function updateEmmaProfile(onState) {
    onState = onState || function () {};
    try {
      onState('Actualizando…');
      if (window.EmmaSync && EmmaSync.isSignedIn() && navigator.onLine) { try { await EmmaSync.sync(); } catch (e) {} }
      let analyzed = 0, blocked = false, pend = [];
      if (enabled()) {
        pend = getPendingEntriesForAnalysis();
        if (pend.length) {
          onState('Analizando nuevas entradas…');
          for (const p of pend.slice(0, MAX_BATCH)) {
            try { await analyzeEntryWithAI(p); analyzed++; }
            catch (e) {
              if (e.blocked) { blocked = true; break; }
              if (p.kind === 'entry') EmmaStore.markEntryStatus(p.id, 'failed'); else EmmaNotes.markStatus(p.id, 'failed');
            }
          }
        }
      }
      onState('Reorganizando perfil…');
      EmmaProfile.rebuildProfileFromEntries();
      saveProfileCache();
      EmmaStore.setMeta({ lastProfileUpdate: new Date().toISOString() });
      if (window.EmmaSync && EmmaSync.isSignedIn() && navigator.onLine) { try { await EmmaSync.sync(); } catch (e) {} }
      onState(blocked ? 'Límite de gasto alcanzado' : (!enabled() ? 'Perfil actualizado' : (analyzed ? 'Perfil actualizado' : (pend.length ? 'Reintenta más tarde' : 'No hay cambios nuevos'))));
      return { analyzed, blocked, pending: pend.length };
    } catch (e) { onState('Error al actualizar, intenta de nuevo'); return { error: e.message }; }
  }

  // Cache local del perfil (rebuild ya guarda emmaProfileData)
  function saveProfileCache() { /* emmaProfileData ya es el cache local */ }
  function loadProfileCache() { return EmmaProfile.data(); }

  /* ---------- Perfil compacto para la IA ---------- */
  function profileForAI() {
    const top = (cat, n, filt) => EmmaProfile.getTopItems(cat, n).filter(filt || (() => true)).map(x => x.label);
    const pos = x => x.pos > 0 && x.neg === 0, neg = x => x.neg > 0 && x.pos === 0;
    return {
      edad: EmmaStore.edadEmma(),
      frutas_comidas_gustan: top('foods', 10, pos),
      comidas_rechaza: top('foods', 10, neg),
      actividades_favoritas: top('activities', 10, x => x.count > 0),
      calman: top('calming', 8),
      frustran: EmmaProfile.getTopItems('frustrations', 8).map(x => x.label),
      canciones: EmmaProfile.getTopItems('songs', 8).map(x => x.label),
      animales_gustan: EmmaProfile.getTopItems('animals', 8).filter(pos).map(x => x.label),
      animales_no: EmmaProfile.getTopItems('animals', 8).filter(neg).map(x => x.label),
      palabras: EmmaProfile.getRecentItems('language', 10).map(x => x.label)
    };
  }

  /* ---------- "¿Qué hacemos hoy?" ---------- */
  async function recommendActivities(context) {
    if (enabled()) {
      try { const d = await callAI('recommend', { context, profile: profileForAI() }); if (d.recommendations) return d.recommendations; }
      catch (e) { /* cae a local */ }
    }
    return localRecommendations(context);
  }

  // Recomendaciones locales (sin IA): primero el banco personalizado de Emma
  function localRecommendations(ctx) {
    if (window.EmmaBank) {
      const b = EmmaBank.recommend(ctx, profileForAI());
      if (b && b.length) return b;
    }
    const P = profileForAI();
    const dur = parseInt(ctx && ctx.tiempo) || 10;
    const recs = [];
    const acts = P.actividades_favoritas.length ? P.actividades_favoritas : ['leer un cuento', 'colorear', 'cantar'];
    const cancion = P.canciones[0] || 'una canción que le guste';
    recs.push({ title: 'Cuento corto con ' + (P.animales_gustan[0] ? 'animales' : 'imágenes'),
      reason: 'Le gusta que le lean' + (P.animales_gustan.length ? ' y los animales' : '') + '.',
      duration_minutes: dur, goal: 'lenguaje y conexión',
      steps: ['Elige 2-3 imágenes o un cuento corto', 'Nombra y haz sonidos simples', 'Deja que Emma señale o intente repetir', 'Celebra cualquier intento'],
      why_for_emma: 'Combina lectura y lenguaje.', save_as_entry: { activity: 'cuento', category: 'lenguaje' } });
    recs.push({ title: 'Cantar ' + cancion,
      reason: 'Las canciones la calman y le gustan.',
      duration_minutes: Math.min(dur, 10), goal: (ctx && ctx.objetivo) || 'calma',
      steps: ['Siéntate cerca, contacto visual', 'Canta ' + cancion + ' despacio', 'Haz gestos con las manos'],
      why_for_emma: 'Ritual de conexión y regulación.', save_as_entry: { activity: 'cantar', category: 'emociones' } });
    recs.push({ title: (acts[0] ? acts[0].charAt(0).toUpperCase() + acts[0].slice(1) : 'Jugar a la cocinilla') + ' juntos',
      reason: 'Actividad que ya disfruta.',
      duration_minutes: dur, goal: (ctx && ctx.objetivo) || 'conexión',
      steps: ['Prepara el material', 'Sigue el ritmo de Emma', 'Nombra lo que hace'],
      why_for_emma: 'Refuerza un gusto conocido.', save_as_entry: { activity: acts[0] || 'juego libre', category: 'juego' } });
    return recs;
  }

  // Decisiones prácticas locales (máx 3), sin sermones
  function practicalDecisions() {
    const P = profileForAI(); const out = [];
    if (P.frutas_comidas_gustan[0]) out.push('Repetir ' + P.frutas_comidas_gustan[0] + ': ya aparece como aceptada.');
    if (P.animales_no[0]) out.push('Evitar acercamiento directo a ' + P.animales_no[0].toLowerCase() + '; trabajarlo con cuentos o imágenes.');
    if (P.canciones[0]) out.push('Usar canciones para calmar, sobre todo ' + P.canciones.slice(0, 2).join(' y ') + '.');
    return out.slice(0, 3);
  }

  async function weeklyAnalysis() {
    if (!enabled()) return null;
    const recientes = EmmaStore.getEntries().filter(e => {
      const d = new Date(e.date); return (Date.now() - d.getTime()) < 8 * 86400000;
    }).map(buildEntryText);
    const d = await callAI('weekly', { profile: profileForAI(), recent: recientes,
      important_notes: (window.EmmaNotes ? EmmaNotes.getNotes().filter(n => n.isImportant).map(n => n.text) : []) });
    return d.weekly;
  }

  function monthSpend() { return EmmaStore.getMeta().aiMonthSpend || 0; }
  function monthLimit() { return C.AI_MONTHLY_LIMIT_USD || 50; }

  return { enabled, updateEmmaProfile, getPendingEntriesForAnalysis, analyzeEntryWithAI, saveEntryAnalysis,
    recommendActivities, practicalDecisions, weeklyAnalysis, profileForAI, loadProfileCache, monthSpend, monthLimit };
})();
if (typeof window !== 'undefined') window.EmmaAI = EmmaAI;
