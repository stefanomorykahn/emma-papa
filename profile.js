/* ============================================================
   profile.js  ·  "Perfil vivo de Emma"
   ------------------------------------------------------------
   Convierte los datos en un perfil organizado. 100% local, sin IA.
   Fuentes:
     1) emma_entries  (registro rápido, estructurado con chips)
     2) emma_notes    (notas de papá; solo como recuerdos)
     3) emma_profile_items (items confirmados manualmente desde notas)
   rebuildProfileFromEntries() reconstruye TODO desde cero, así al
   editar/borrar una entrada el perfil queda correcto.
   Resultado guardado en localStorage: 'emmaProfileData'.
   ============================================================ */
const EmmaProfile = (function () {

  /* ---------- Listas de referencia ---------- */
  const FRUTAS = ['plátano','platano','banana','manzana','mango','papaya','fresa','sandía','sandia',
    'uva','mandarina','naranja','palta','aguacate','pera','durazno','piña','pina','melón','melon',
    'kiwi','ciruela','arándano','arandano','cereza','frambuesa','mora','granada','coco',
    'granadilla','guayaba','maracuyá','maracuya','guanábana','guanabana','carambola','tuna','lúcuma','lucuma'];
  const BEBIDAS = ['agua','leche','jugo','zumo','té','te','batido','smoothie'];
  const SNACKS  = ['galleta','galletas','pan','tostada','cereal','barra','queso','crackers'];

  const BASE_COMIDA = ['Plátano','Manzana','Mango','Papaya','Fresa','Sandía','Uva','Mandarina','Palta',
                       'Huevo','Pollo','Arroz','Pasta','Yogurt','Sopa'];
  const BASE_ACTIVIDAD = ['Parque','Cuento','Música','Baile','Comida juntos','Oración','Bloques','Playa',
                          'Caminar','Videollamada','Juego libre','Baño','Siesta','Agua','Dibujar'];

  // Nombres de categoría/genéricos que NO son palabras dichas por Emma (se cuelan en newWords).
  const CAT_GENERICAS = ['fruta','frutas','comida','comidas','bebida','bebidas','snack','snacks',
    'verdura','verduras','postre','postres','actividad','actividades','lugar','lugares','animal','animales',
    'cancion','canciones','palabra','palabras','otro','otros','desayuno','almuerzo','cena','merienda','lonche'];
  // ¿El token es en realidad una comida/fruta/bebida/snack o un nombre de categoría? (no una palabra)
  function esTokenComida(tok) {
    const k = norm(tok);
    if (!k) return false;
    if (FRUTAS.indexOf(k) >= 0 || BEBIDAS.indexOf(k) >= 0 || SNACKS.indexOf(k) >= 0) return true;
    if (BASE_COMIDA.some(x => norm(x) === k)) return true;
    return CAT_GENERICAS.indexOf(k) >= 0;
  }

  const POS = ['encant','le gust','le encant','pidió más','pidio mas','disfrut','feliz','rió','rio',
    'contenta','adora','quería más','queria mas','fascin','sonri','tranquil','calm','ama '];
  const NEG = ['no quiso','no le gust','rechaz','escup','lloró','lloro','no comió','no comio','no aceptó',
    'no acepto','odió','odio','se frustr','molest','berrinche','asust','miedo'];

  /* ---------- Utilidades ---------- */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[.,;:!¡¿?"'()]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function pretty(s) { s = String(s || '').trim().replace(/\s+/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }
  function toList(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(x => String(x).trim()).filter(Boolean);
    return String(val).split(/[,;]+/).map(x => x.trim()).filter(Boolean);
  }
  function sentimentDeTexto(txt) {
    const t = norm(txt);
    const pos = POS.some(k => t.includes(norm(k)));
    const neg = NEG.some(k => t.includes(norm(k)));
    if (pos && !neg) return 'pos';
    if (neg && !pos) return 'neg';
    return 'neu';
  }
  // Resultado de comida (chips) -> sentimiento
  function resultadoASentimiento(r) {
    const t = norm(r);
    if (!t) return 'neu';
    if (t.includes('no le gust') || t.includes('rechaz')) return 'neg';
    if (t.includes('gust') || t.includes('encant')) return 'pos';
    return 'neu';
  }

  /* ---------- Estructura del perfil ---------- */
  function nuevoStore() {
    return { foods:{}, activities:{}, liked:{}, language:{}, calming:{}, frustrations:{}, places:{}, people:{},
             songs:{}, animals:{}, personality:{}, routines:{}, ideas:{} };
  }
  function addItem(cat, rawLabel, opts) {
    opts = opts || {};
    const key = norm(rawLabel);
    if (!key) return;
    if (!cat[key]) cat[key] = { label: pretty(rawLabel), count: 0, pos: 0, neg: 0, neu: 0, lastDate: '',
                                notes: [], moods: {}, sources: {}, confSum: 0, confN: 0 };
    const it = cat[key];
    it.count++;
    if (opts.sentiment === 'pos') it.pos++; else if (opts.sentiment === 'neg') it.neg++; else it.neu++;
    if (opts.date && opts.date > it.lastDate) it.lastDate = opts.date;
    if (opts.note) { const n = String(opts.note).slice(0, 140); if (n && !it.notes.includes(n) && it.notes.length < 3) it.notes.push(n); }
    if (opts.mood) it.moods[opts.mood] = (it.moods[opts.mood] || 0) + 1;
    if (opts.source) it.sources[opts.source] = (it.sources[opts.source] || 0) + 1;
    if (typeof opts.confidence === 'number' && opts.confidence > 0) { it.confSum += opts.confidence; it.confN++; }
  }
  // Mapa categoría (item confirmado / IA / seed) -> store
  const CAT_STORE = { food:'foods', fruit:'foods', drink:'foods', activity:'activities', liked:'liked',
    word:'language', language:'language', place:'places', person:'people', people:'people',
    calming:'calming', frustration:'frustrations', song:'songs', animal:'animals',
    personality:'personality', routine:'routines', idea:'ideas' };
  // Mapea sentimiento de IA a interno
  function iaSent(s) { return s === 'liked' ? 'pos' : (s === 'disliked' ? 'neg' : 'neu'); }

  /* ============================================================
     RECONSTRUIR PERFIL
     entries / notes / confirmedItems son opcionales (se leen solos)
     ============================================================ */
  function rebuildProfileFromEntries(entries, notes, confirmedItems, analyses) {
    if (!entries) entries = EmmaStore.getEntries();
    if (!notes) notes = (window.EmmaNotes ? EmmaNotes.getNotes() : []);
    if (!confirmedItems) confirmedItems = (EmmaStore.getProfileItems ? EmmaStore.getProfileItems() : []);
    if (!analyses) analyses = (EmmaStore.getAnalyses ? EmmaStore.getAnalyses() : []);

    const S = nuevoStore();
    const memories = [];
    const seen = {};            // sourceId -> Set('store|nombre')  (evita doble conteo con IA)
    const dateById = {};        // sourceId -> fecha
    const markSeen = (id, store, name) => { (seen[id] = seen[id] || new Set()).add(store + '|' + norm(name)); };
    const wasSeen = (id, store, name) => seen[id] && seen[id].has(store + '|' + norm(name));

    entries.forEach(e => {
      dateById[e.id] = e.date || (e.createdAt || '').slice(0, 10);
      const date = e.date || (e.createdAt || '').slice(0, 10);
      const mood = e.mood || e.emotionalState || '';
      const noteTxt = e.note || e.notes || e.freeText || '';
      const likedList = toList(e.liked).concat(toList(e.favoriteActivity));
      const likedNorm = new Set(likedList.map(norm));
      const foodSent = e.food_result ? resultadoASentimiento(e.food_result) : null;

      const add = (store, storeName, label, o) => { addItem(store, label, Object.assign({ source: 'manual' }, o)); markSeen(e.id, storeName, label); };
      // Actividades
      toList(e.activities).forEach(a => add(S.activities, 'activities', a, { sentiment: likedNorm.has(norm(a)) ? 'pos' : 'neu', date, mood, note: likedNorm.has(norm(a)) ? noteTxt : '' }));
      // Gustos
      likedList.forEach(l => add(S.liked, 'liked', l, { sentiment: 'pos', date, mood, note: noteTxt }));
      // Comidas / frutas (sentimiento por resultado de chips)
      toList(e.foods).concat(toList(e.fruits)).forEach(f => {
        let s = foodSent; if (s === null) s = likedNorm.has(norm(f)) ? 'pos' : 'neu';
        add(S.foods, 'foods', f, { sentiment: s, date, mood, note: (s !== 'neu' ? noteTxt : '') });
      });
      toList(e.rejectedFoods).forEach(f => add(S.foods, 'foods', f, { sentiment: 'neg', date, note: noteTxt }));
      // Lenguaje
      toList(e.newWords).forEach(w => {
        if (esTokenComida(w)) return; // "Fruta", "Manzana"… no son palabras dichas por Emma
        if (toList(e.foods).concat(toList(e.fruits)).some(f => norm(f) === norm(w))) return; // coincide con comida registrada
        add(S.language, 'language', w, { sentiment: 'neu', date, note: noteTxt });
      });
      // Calma
      toList(e.calmingThings).concat(toList(e.calmingThing)).forEach(c => add(S.calming, 'calming', c, { sentiment: 'pos', date, note: noteTxt }));
      // Frustraciones
      toList(e.frustrations).concat(toList(e.frustration)).concat(toList(e.difficultActivity)).forEach(f => add(S.frustrations, 'frustrations', f, { sentiment: 'neg', date, note: noteTxt }));
      // Lugares
      toList(e.places).concat(toList(e.place)).forEach(p => {
        const s = foodSent !== null ? foodSent : sentimentDeTexto(noteTxt);
        add(S.places, 'places', p, { sentiment: (s === 'neg' ? 'neg' : (s === 'pos' ? 'pos' : 'neu')), date, mood, note: noteTxt });
      });
      // Personas
      toList(e.people).forEach(p => add(S.people, 'people', p, { sentiment: 'neu', date, mood, note: noteTxt }));
      // Recuerdos
      if (/primera vez|por primera/i.test(noteTxt)) memories.push({ date, text: noteTxt, kind: 'Primera vez' });
      if (e.tenderMoment) memories.push({ date, text: e.tenderMoment, kind: 'Ternura' });
      if (e.newLearning)  memories.push({ date, text: e.newLearning, kind: 'Avance' });
    });

    notes.forEach(n => { dateById[n.id] = n.date; });

    // Items confirmados / perfil inicial (emma_profile_items) — incluye seed
    confirmedItems.forEach(i => {
      const storeName = CAT_STORE[norm(i.category)] || 'liked';
      addItem(S[storeName], i.name, { sentiment: i.sentiment || 'neu',
        date: (i.createdAt || '').slice(0, 10) || (i.date || ''), note: i.notes || '',
        source: (i.source === 'inicial' || i.source === 'seed') ? 'inicial' : 'nota' });
    });

    // Análisis de IA (emma_entry_analysis) — no duplica lo ya contado manualmente
    analyses.forEach(a => {
      const A = a.analysis_json || a.analysis || a; if (!A || typeof A !== 'object') return;
      const sid = a.entryId || a.entry_id || a.sourceId || '';
      const date = dateById[sid] || (a.createdAt || '').slice(0, 10);
      const put = (storeName, name, sentiment, evidence, conf) => {
        if (!name) return; if (wasSeen(sid, storeName, name)) return;
        addItem(S[storeName], name, { sentiment, date, note: evidence || '', source: 'ia', confidence: conf });
        markSeen(sid, storeName, name);
      };
      (A.fruits || []).forEach(x => put('foods', x.name, iaSent(x.sentiment), x.evidence, x.confidence));
      (A.foods || []).forEach(x => put('foods', x.name, iaSent(x.sentiment), x.evidence, x.confidence));
      (A.activities || []).forEach(x => put('activities', x.name, iaSent(x.sentiment), x.evidence, x.confidence));
      (A.calming_things || []).forEach(x => put('calming', x.name, 'pos', x.evidence, x.confidence));
      (A.frustrations || []).forEach(x => put('frustrations', x.name, 'neg', x.evidence, x.confidence));
      (A.new_words || []).forEach(x => { if (!esTokenComida(x.word)) put('language', x.word, 'neu', x.context, x.confidence); });
      (A.places || []).forEach(x => put('places', x.name, iaSent(x.sentiment), x.evidence, x.confidence));
      (A.people || []).forEach(x => put('people', x.name, 'neu', x.evidence, x.confidence));
      if (A.important_memory) memories.push({ date, text: A.important_memory, kind: 'IA' });
    });

    // Notas importantes -> recuerdos
    notes.forEach(n => { if (n.isImportant) memories.push({ date: n.date, text: n.text, kind: 'Nota importante' }); });

    memories.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const data = { updatedAt: new Date().toISOString(), categories: S, memories: memories.slice(0, 60) };
    localStorage.setItem('emmaProfileData', JSON.stringify(data));
    return data;
  }

  function data() {
    try { return JSON.parse(localStorage.getItem('emmaProfileData')) || rebuildProfileFromEntries(); }
    catch (e) { return rebuildProfileFromEntries(); }
  }

  /* ---------- Estado / consultas ---------- */
  function estado(it) {
    if (it.pos > 0 && it.neg === 0) return it.pos >= 3 ? 'Le gusta mucho' : 'Le gustó';
    if (it.neg > 0 && it.pos === 0) return 'No le gustó';
    if (it.pos > 0 && it.neg > 0) return 'Variable';
    return it.count <= 1 ? 'Probado una vez' : 'Neutral';
  }
  function estadoClase(it) {
    if (it.pos > 0 && it.neg === 0) return 'e-pos';
    if (it.neg > 0 && it.pos === 0) return 'e-neg';
    if (it.pos > 0 && it.neg > 0) return 'e-var';
    return 'e-neu';
  }
  function moodTop(it) { let m = '', n = 0; for (const k in it.moods) if (it.moods[k] > n) { n = it.moods[k]; m = k; } return m; }
  function itemsDe(catName) { return Object.values((data().categories[catName]) || {}); }
  function getTopItems(catName, n) {
    return itemsDe(catName).sort((a, b) => (b.pos - b.neg) - (a.pos - a.neg) || b.count - a.count).slice(0, n || 99);
  }
  function getRecentItems(catName, n) {
    return itemsDe(catName).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '')).slice(0, n || 99);
  }
  function getSuggestedChips(category) {
    const base = category === 'food' ? BASE_COMIDA : BASE_ACTIVIDAD;
    const catName = category === 'food' ? 'foods' : 'activities';
    const vistos = new Set(base.map(norm));
    const extra = itemsDe(catName).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || b.count - a.count)
      .map(it => it.label).filter(l => { const k = norm(l); if (vistos.has(k)) return false; vistos.add(k); return true; });
    return base.concat(extra).slice(0, 20);
  }
  function historyTokens(category) {
    const map = { food:'foods', activity:'activities', liked:'liked', word:'language', place:'places', person:'people' };
    return itemsDe(map[category] || 'liked').map(it => it.label);
  }

  /* ---------- Detección en texto libre (solo sugiere) ---------- */
  function extractSuggestionsFromFreeText(text) {
    const t = norm(text);
    if (!t) return [];
    const sent = sentimentDeTexto(text);
    const out = []; const visto = new Set();
    const push = (type, label) => { const k = type + ':' + norm(label); if (visto.has(k)) return; visto.add(k); out.push({ type, value: pretty(label), sentiment: sent, label: pretty(label) }); };
    const comidas = new Set([...FRUTAS, ...BASE_COMIDA.map(norm), ...historyTokens('food').map(norm)]);
    comidas.forEach(c => { if (c && new RegExp('\\b' + c + '\\b').test(t)) push('food', c); });
    const acts = new Set([...BASE_ACTIVIDAD.map(norm), ...historyTokens('activity').map(norm)]);
    acts.forEach(a => { if (a && new RegExp('\\b' + a + '\\b').test(t)) push('activity', a); });
    const m = text.match(/di(?:jo|ce)\s+["']?([\wáéíóúñ]{2,20})/i);
    if (m) push('word', m[1]);
    return out;
  }

  // Confirmar item detectado -> lo guarda como emma_profile_items y reconstruye
  function addDetectedItemToProfile(type, value, sentiment, sourceId) {
    if (!EmmaStore.saveProfileItem) return;
    EmmaStore.saveProfileItem({
      category: (type === 'fruit' ? 'food' : type),
      name: value, sentiment: sentiment || 'neu', source: 'nota', sourceId: sourceId || null, notes: ''
    });
    rebuildProfileFromEntries();
  }

  /* ---------- Render de pestañas (HTML string) ---------- */
  function fechaCorta(iso) {
    if (!iso) return '—';
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fuenteLabel(it) {
    const s = it.sources || {};
    const parts = [];
    if (s.inicial) parts.push('inicial');
    if (s.manual) parts.push('registro');
    if (s.nota) parts.push('nota');
    if (s.ia) parts.push('IA' + (it.confN ? ' ' + Math.round(100 * it.confSum / it.confN) + '%' : ''));
    return parts.join(' · ');
  }
  function card(it) {
    const mt = moodTop(it);
    const fu = fuenteLabel(it);
    return `<div class="p-item"><div class="pi-top"><span class="pi-label">${esc(it.label)}</span>
      <span class="estado ${estadoClase(it)}">${estado(it)}</span></div>
      <div class="pi-meta">${it.count} ${it.count === 1 ? 'vez' : 'veces'} · última: ${fechaCorta(it.lastDate)}${mt ? ' · suele estar ' + esc(mt.toLowerCase()) : ''}${fu ? ' · ' + fu : ''}</div>
      ${it.notes.length ? `<div class="pi-nota">"${esc(it.notes[it.notes.length - 1])}"</div>` : ''}</div>`;
  }
  function seccion(t, items) { return (items && items.length) ? `<h4 class="p-sub">${t}</h4>` + items.map(card).join('') : ''; }
  function vacio(msg) { return `<p class="p-vacio">${msg || 'Aún sin datos.'}</p>`; }
  const isFruit = it => FRUTAS.includes(norm(it.label));
  const isBebida = it => BEBIDAS.includes(norm(it.label));
  const isSnack  = it => SNACKS.includes(norm(it.label));
  const esPos = it => it.pos > 0 && it.neg === 0;
  const esNeg = it => it.neg > 0 && it.pos === 0;

  function renderTab(tab) {
    const D = data();
    const foods = Object.values(D.categories.foods);
    const acts = Object.values(D.categories.activities);
    switch (tab) {
      case 'alimentacion': {
        const frutas = foods.filter(isFruit);
        const otras = foods.filter(f => !isFruit(f) && !isBebida(f) && !isSnack(f));
        return (seccion('Frutas que le gustan', frutas.filter(esPos)) +
          seccion('Frutas que no aceptó', frutas.filter(esNeg)) +
          seccion('Comidas favoritas', otras.filter(esPos)) +
          seccion('Comidas que rechazó', otras.filter(esNeg)) +
          seccion('Comidas nuevas (una vez)', foods.filter(f => f.count === 1 && !esNeg(f))) +
          seccion('Bebidas', foods.filter(isBebida)) +
          seccion('Snacks', foods.filter(isSnack))) || vacio();
      }
      case 'actividades':
        return (seccion('Favoritas', getTopItems('activities', 6).filter(a => a.count > 0)) +
          seccion('Para repetir', acts.filter(esPos)) +
          seccion('Que la calman', getTopItems('calming', 20)) +
          seccion('Que la frustran', Object.values(D.categories.frustrations)) +
          seccion('Nuevas (una vez)', acts.filter(a => a.count === 1))) || vacio();
      case 'sobre': {
        const an = Object.values(D.categories.animals);
        return (seccion('Personalidad', Object.values(D.categories.personality)) +
          seccion('Canciones que le gustan', Object.values(D.categories.songs)) +
          seccion('Animales que le gustan', an.filter(x => !esNeg(x))) +
          seccion('Animales que no le gustan', an.filter(esNeg)) +
          seccion('Rutinas y cuidados', Object.values(D.categories.routines)) +
          seccion('Ideas futuras', Object.values(D.categories.ideas))) || vacio('Aún sin datos.');
      }
      case 'resumen':
      default: {
        const chips = arr => arr.length ? `<div class="tags">${arr.map(x => `<span class="tag">${esc(x.label)}<span class="x">${x.count}</span></span>`).join('')}</div>` : vacio();
        return `<div class="p-bloque"><h3>${esc(EmmaStore.EMMA.nombre)}</h3>
            <div class="pi-meta">Nació 17/07/2024 · <b>${EmmaStore.edadEmma()}</b> · Estado frecuente: <b>${EmmaStore.emocionFrecuente() || '—'}</b></div></div>
          <div class="p-bloque"><h3>Actividades top</h3>${chips(getTopItems('activities', 5).filter(a => a.count > 0))}</div>
          <div class="p-bloque"><h3>Le gustan</h3>${chips(getTopItems('foods', 5).filter(esPos))}</div>
          <div class="p-bloque"><h3>Palabras recientes</h3>${(getRecentItems('language', 5).length ? `<div class="tags">${getRecentItems('language', 5).map(w => `<span class="tag">${esc(w.label)}</span>`).join('')}</div>` : vacio())}</div>`;
      }
    }
  }

  // Fotos relacionadas con un item del perfil (por tag o por su entrada)
  function getPhotosForProfileItem(category, itemName) {
    if (!(window.EmmaStore && EmmaStore.getPhotos)) return [];
    const n = norm(itemName);
    const entries = EmmaStore.getEntries();
    return EmmaStore.getPhotos().filter(p => {
      if ((p.tags || []).some(t => norm(t) === n)) return true;
      if (p.entryId) { const e = entries.find(x => x.id === p.entryId);
        if (e && toList(e.activities).concat(toList(e.foods)).concat(toList(e.liked)).some(c => norm(c) === n)) return true; }
      return false;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  return { rebuildProfileFromEntries, data, getTopItems, getRecentItems, getSuggestedChips,
    historyTokens, extractSuggestionsFromFreeText, addDetectedItemToProfile, renderTab, getPhotosForProfileItem, esTokenComida };
})();
if (typeof window !== 'undefined') window.EmmaProfile = EmmaProfile;
