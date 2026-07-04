/* ============================================================
   seed.js  ·  Perfil inicial de Emma (datos semilla)
   ------------------------------------------------------------
   Carga una sola vez los gustos ya conocidos de Emma como
   "items confirmados" (source: 'inicial'). Se mezclan con
   entradas, notas, IA e items confirmados al reconstruir el
   Perfil Vivo, y sirven como chips sugeridos. Editables desde
   el perfil (son emma_profile_items).
   ============================================================ */
const EmmaSeed = (function () {
  const SEED = [
    // Frutas que le gustan
    { cat: 'fruit', name: 'Granadilla', sent: 'pos', ev: 'Fruta que le gusta' },
    { cat: 'fruit', name: 'Guayaba', sent: 'pos', ev: 'Fruta que le gusta' },
    // Comidas que le gustan
    { cat: 'food', name: 'Frejol', sent: 'pos', ev: 'Comida que le gusta' },
    { cat: 'food', name: 'Huevo con farinha', sent: 'pos', ev: 'Comida que le gusta' },
    // Rutina de leche
    { cat: 'routine', name: 'Leche 210 ml (5 scoops)', sent: 'neu', ev: '210 ml = 5 scoops' },
    // Actividades que le gustan
    { cat: 'activity', name: 'Que le lean', sent: 'pos' },
    { cat: 'activity', name: 'Colorear', sent: 'pos' },
    { cat: 'activity', name: 'Jugar a la cocinilla', sent: 'pos' },
    { cat: 'activity', name: 'Que le canten', sent: 'pos' },
    { cat: 'activity', name: 'Bailar', sent: 'pos' },
    { cat: 'activity', name: 'Escondidas', sent: 'pos' },
    { cat: 'activity', name: 'Hacer el "4"', sent: 'pos' },
    // Animales
    { cat: 'animal', name: 'Animales', sent: 'pos', ev: 'Le gustan los animales en general' },
    { cat: 'animal', name: 'Perros', sent: 'neg', ev: 'No le gustan los perros' },
    // Canciones favoritas
    { cat: 'song', name: 'Feliz cumpleaños (portugués)', sent: 'pos' },
    { cat: 'song', name: 'As Rodas do Ônibus Vai Girar', sent: 'pos' },
    { cat: 'song', name: 'Cuando hundido estás', sent: 'pos' },
    { cat: 'song', name: 'La abejita', sent: 'pos' },
    // Personalidad
    { cat: 'personality', name: 'Sonriente', sent: 'pos', ev: 'Es muy sonriente' },
    { cat: 'personality', name: 'Cariñosa', sent: 'pos', ev: 'Es muy cariñosa' },
    { cat: 'personality', name: 'Curiosa', sent: 'pos' },
    { cat: 'personality', name: 'Juguetona', sent: 'pos' },
    // Ideas futuras
    { cat: 'idea', name: 'Natación', sent: 'neu', ev: 'Quiero meterla a natación' }
  ];

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

  // UUID DETERMINISTA (formato v5) desde (categoría, nombre): el MISMO id en todos
  // los dispositivos, así el sync colapsa los duplicados en vez de multiplicarlos.
  // (La columna id en Supabase es uuid, por eso no basta un string tipo 'seed_...'.)
  function seedUuid(cat, name) {
    const str = 'emma-seed:' + norm(cat) + ':' + norm(name);
    const h = seed => { let x = seed >>> 0; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x >>> 0; };
    const hx = n => ('00000000' + (n >>> 0).toString(16)).slice(-8);
    const r = hx(h(0x811c9dc5)) + hx(h(0x9e3779b1)) + hx(h(0x85ebca77)) + hx(h(0xc2b2ae3d));
    const y = ((parseInt(r[16], 16) & 0x3) | 0x8).toString(16);
    return r.slice(0, 8) + '-' + r.slice(8, 12) + '-5' + r.slice(13, 16) + '-' + y + r.slice(17, 20) + '-' + r.slice(20, 32);
  }

  // Idempotente: agrega solo los items del seed que aún no existen.
  // Así se pueden añadir gustos nuevos al SEED sin duplicar los previos.
  function loadSeedIfNeeded() {
    const hoy = new Date().toISOString().slice(0, 10);
    let existentes;
    try { existentes = EmmaStore.getProfileItems(); } catch (e) { return false; }
    const clave = i => norm(i.category) + '|' + norm(i.name);
    const set = new Set(existentes.filter(i => i.source === 'inicial').map(clave));
    let agregados = 0;
    SEED.forEach(s => {
      const k = norm(s.cat) + '|' + norm(s.name);
      if (set.has(k)) return;
      EmmaStore.saveProfileItem({ id: seedUuid(s.cat, s.name), category: s.cat, name: s.name, sentiment: s.sent || 'neu',
        source: 'inicial', notes: s.ev || '', date: hoy });
      set.add(k); agregados++;
    });
    localStorage.setItem('emmaSeeded', '1');
    if (agregados && window.EmmaProfile) EmmaProfile.rebuildProfileFromEntries();
    return agregados > 0;
  }

  // Colapsa los items 'inicial' duplicados a UNO por (categoría, nombre), con id
  // determinista. Idempotente: si ya está limpio no toca nada (evita churn de sync).
  // Los borrados se propagan por tombstones. Devuelve true si cambió algo.
  function dedupeInitialItems() {
    let items;
    try { items = EmmaStore.getProfileItems(); } catch (e) { return false; }
    const iniciales = items.filter(i => i.source === 'inicial');
    if (!iniciales.length) return false;
    const groups = {};
    iniciales.forEach(i => { const k = norm(i.category) + '|' + norm(i.name); (groups[k] = groups[k] || []).push(i); });
    // ¿ya está limpio? (1 por grupo y cada uno con su id determinista)
    const limpio = Object.values(groups).every(g => g.length === 1 && g[0].id === seedUuid(g[0].category, g[0].name));
    if (limpio) return false;
    const nonInicial = items.filter(i => i.source !== 'inicial');
    const kept = [], removedIds = [], now = new Date().toISOString();
    Object.values(groups).forEach(group => {
      const detId = seedUuid(group[0].category, group[0].name);
      const rep = Object.assign({}, group[0], { id: detId, source: 'inicial', updatedAt: now });
      group.forEach(g => {
        if (g.createdAt && (!rep.createdAt || g.createdAt < rep.createdAt)) rep.createdAt = g.createdAt;
        if ((rep.sentiment === 'neu' || !rep.sentiment) && g.sentiment && g.sentiment !== 'neu') rep.sentiment = g.sentiment;
        if (!rep.notes && g.notes) rep.notes = g.notes;
      });
      kept.push(rep);
      group.forEach(g => { if (g.id !== detId) removedIds.push(g.id); });
    });
    EmmaStore._setProfileItemsRaw(nonInicial.concat(kept));
    const tomb = EmmaStore.getPiTombstones();
    removedIds.forEach(id => { tomb[id] = now; });
    kept.forEach(k => { if (tomb[k.id]) delete tomb[k.id]; });
    EmmaStore.setPiTombstones(tomb);
    if (window.EmmaProfile) EmmaProfile.rebuildProfileFromEntries();
    if (window.EmmaSync && EmmaSync.onLocalChange) EmmaSync.onLocalChange(); // propaga tombstones
    return true;
  }

  return { SEED, loadSeedIfNeeded, dedupeInitialItems, seedUuid };
})();
if (typeof window !== 'undefined') window.EmmaSeed = EmmaSeed;
