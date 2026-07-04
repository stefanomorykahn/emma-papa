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
      EmmaStore.saveProfileItem({ category: s.cat, name: s.name, sentiment: s.sent || 'neu',
        source: 'inicial', notes: s.ev || '', date: hoy });
      set.add(k); agregados++;
    });
    localStorage.setItem('emmaSeeded', '1');
    if (agregados && window.EmmaProfile) EmmaProfile.rebuildProfileFromEntries();
    return agregados > 0;
  }

  return { SEED, loadSeedIfNeeded };
})();
if (typeof window !== 'undefined') window.EmmaSeed = EmmaSeed;
