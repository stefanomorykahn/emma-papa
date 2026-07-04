/* ============================================================
   supabase-sync.js  ·  Sincronización offline-first con Supabase
   ------------------------------------------------------------
   La app SIEMPRE lee/escribe en localStorage (rápido, offline).
   Este motor sincroniza 3 tablas columnar con Supabase:
       emma_entries · emma_notes · emma_profile_items
   - Estrategia: "gana el más reciente" por registro (updatedAt),
     con borrado suave (columna deleted) para propagar borrados.
   - Requiere iniciar sesión (email/contraseña). RLS por user_id.
   - Si supabase-config.js está vacío, todo queda 100% local.
   ============================================================ */
(function () {
  const cfg = (window.SUPABASE_CONFIG || {});
  const URL_BASE = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  const ANON = cfg.SUPABASE_ANON_KEY || '';
  const CONFIGURED = !!(URL_BASE && ANON);

  const KEY_AUTH = 'emmaAuth';
  let session = _loadSession();
  let busy = false, debounceTimer = null;

  const EmmaSync = {
    configured: CONFIGURED,
    state: 'local',
    onStateChange: null,
    isConfigured() { return CONFIGURED; },
    isSignedIn() { return !!(session && session.access_token); },
    currentEmail() { return session ? session.email : ''; },
    accessToken() { return session ? session.access_token : ''; },
    urlBase() { return URL_BASE; },
    anonKey() { return ANON; },
    userId() { return session ? session.user_id : ''; },

    onLocalChange() {
      if (!CONFIGURED || !EmmaSync.isSignedIn()) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => EmmaSync.sync(), 1500);
    },

    async signIn(email, password) {
      const r = await fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error_description || e.msg || 'No se pudo iniciar sesión'); }
      const d = await r.json();
      session = { access_token: d.access_token, refresh_token: d.refresh_token,
        expires_at: Date.now() + (d.expires_in || 3600) * 1000,
        user_id: d.user && d.user.id, email: (d.user && d.user.email) || email };
      _saveSession();
      await EmmaSync.sync();
      return true;
    },
    signOut() { session = null; localStorage.removeItem(KEY_AUTH); _setState('signed-out'); },

    async changePassword(newPassword) {
      if (!EmmaSync.isSignedIn()) throw new Error('Inicia sesión primero.');
      if (session && session.expires_at && Date.now() > session.expires_at - 60000) await _refresh();
      const r = await _fetchTO(URL_BASE + '/auth/v1/user', {
        method: 'PUT',
        headers: { apikey: ANON, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      }, 15000);
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.msg || e.error_description || e.message || ('No se pudo cambiar (HTTP ' + r.status + ')')); }
      return true;
    },

    async sync() {
      if (!CONFIGURED) { _setState('local'); return; }
      if (!EmmaSync.isSignedIn()) { _setState('signed-out'); return; }
      if (!navigator.onLine) { _setState('offline'); return; }
      if (busy) return;
      busy = true; _setState('syncing');
      try {
        for (const t of TABLES) await syncTable(t);
        if (window.EmmaProfile) EmmaProfile.rebuildProfileFromEntries();
        EmmaStore.setMeta({ lastSync: new Date().toISOString() });
        _setState('synced');
        if (typeof window.onEmmaSynced === 'function') window.onEmmaSynced();
      } catch (err) {
        console.warn('[EmmaSync]', err && err.message);
        _setState(navigator.onLine ? 'error' : 'offline');
      } finally { busy = false; }
    },

    statusText() {
      return ({ local: 'Solo en este dispositivo', offline: 'Sin conexión · guardado local',
        'signed-out': 'Inicia sesión para sincronizar', syncing: 'Sincronizando…',
        synced: 'Sincronizado ✓', error: 'Error al sincronizar' })[EmmaSync.state] || '';
    }
  };

  /* ---------- Sesión ---------- */
  function _loadSession() { try { return JSON.parse(localStorage.getItem(KEY_AUTH)); } catch (e) { return null; } }
  function _saveSession() { localStorage.setItem(KEY_AUTH, JSON.stringify(session)); }
  function _setState(s) { EmmaSync.state = s; if (typeof EmmaSync.onStateChange === 'function') EmmaSync.onStateChange(s); }

  // fetch con timeout (evita que una petición colgada bloquee la app)
  function _fetchTO(url, opts, ms) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms || 15000);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(to));
  }

  /* ---------- Fetch autenticado ---------- */
  async function _authFetch(path, opts, _retry) {
    opts = opts || {};
    if (session && session.expires_at && Date.now() > session.expires_at - 60000) await _refresh();
    const headers = Object.assign({ apikey: ANON, Authorization: 'Bearer ' + (session ? session.access_token : ''),
      'Content-Type': 'application/json' }, opts.headers || {});
    const r = await _fetchTO(URL_BASE + path, Object.assign({}, opts, { headers }), 15000);
    if (r.status === 401 && !_retry) { await _refresh(); return _authFetch(path, opts, true); }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    return r;
  }
  async function _refresh() {
    if (!session || !session.refresh_token) throw new Error('Sesión expirada');
    const r = await fetch(URL_BASE + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!r.ok) { EmmaSync.signOut(); throw new Error('Sesión expirada'); }
    const d = await r.json();
    session.access_token = d.access_token;
    session.refresh_token = d.refresh_token || session.refresh_token;
    session.expires_at = Date.now() + (d.expires_in || 3600) * 1000;
    _saveSession();
  }

  /* ============================================================
     MAPEO local <-> columnas de Supabase
     ============================================================ */
  const arr = v => Array.isArray(v) ? v : (v ? String(v).split(/[,;]+/).map(s => s.trim()).filter(Boolean) : []);

  const TABLES = [
    { // emma_entries
      path: '/rest/v1/emma_entries',
      localAll: () => EmmaStore.getEntries(),
      setAll: a => EmmaStore._setEntriesRaw(a),
      tombs: () => EmmaStore.getTombstones(),
      setTombs: o => EmmaStore.setTombstones(o),
      toRow: (e, owner) => ({
        id: e.id, user_id: owner, date: e.date || null, mood: e.mood || e.emotionalState || null,
        activities: arr(e.activities), liked_items: arr(e.liked), foods: arr(e.foods), fruits: arr(e.fruits),
        food_result: e.food_result || null, new_words: arr(e.newWords), calming_things: arr(e.calmingThings),
        frustrations: arr(e.frustrations), places: arr(e.places), people: arr(e.people),
        note: e.note || e.notes || e.freeText || null,
        created_at: e.createdAt || null, updated_at: e.updatedAt || new Date().toISOString(), deleted: false
      }),
      fromRow: r => ({
        id: r.id, date: r.date || '', mood: r.mood || '',
        activities: r.activities || [], liked: r.liked_items || [], foods: r.foods || [], fruits: r.fruits || [],
        food_result: r.food_result || '', newWords: r.new_words || [], calmingThings: r.calming_things || [],
        frustrations: r.frustrations || [], places: r.places || [], people: r.people || [],
        note: r.note || '', createdAt: r.created_at || '', updatedAt: r.updated_at || ''
      })
    },
    { // emma_notes
      path: '/rest/v1/emma_notes',
      localAll: () => EmmaNotes.getNotes(),
      setAll: a => EmmaNotes._setRaw(a),
      tombs: () => EmmaNotes.getTombstones(),
      setTombs: o => EmmaNotes.setTombstones(o),
      toRow: (n, owner) => ({
        id: n.id, user_id: owner, date: n.date || null, text: n.text || '', tags: arr(n.tags),
        is_important: !!n.isImportant, created_at: n.createdAt || null,
        updated_at: n.updatedAt || new Date().toISOString(), deleted: false
      }),
      fromRow: r => ({
        id: r.id, date: r.date || '', text: r.text || '', tags: r.tags || [],
        isImportant: !!r.is_important, createdAt: r.created_at || '', updatedAt: r.updated_at || ''
      })
    },
    { // emma_profile_items
      path: '/rest/v1/emma_profile_items',
      localAll: () => EmmaStore.getProfileItems(),
      setAll: a => EmmaStore._setProfileItemsRaw(a),
      tombs: () => EmmaStore.getPiTombstones(),
      setTombs: o => EmmaStore.setPiTombstones(o),
      toRow: (i, owner) => ({
        id: i.id, user_id: owner, category: i.category || null, subcategory: i.subcategory || null,
        name: i.name || '', sentiment: i.sentiment || null, source: i.source || 'nota',
        source_id: i.sourceId || null, notes: i.notes || null,
        created_at: i.createdAt || null, updated_at: i.updatedAt || new Date().toISOString(), deleted: false
      }),
      fromRow: r => ({
        id: r.id, category: r.category || '', subcategory: r.subcategory || '', name: r.name || '',
        sentiment: r.sentiment || '', source: r.source || '', sourceId: r.source_id || null,
        notes: r.notes || '', createdAt: r.created_at || '', updatedAt: r.updated_at || ''
      })
    },
    { // emma_photos (metadata; el archivo vive en Google Drive)
      path: '/rest/v1/emma_photos',
      localAll: () => EmmaStore.getPhotos(),
      setAll: a => EmmaStore._setPhotosRaw(a),
      tombs: () => EmmaStore.getPhTombstones(),
      setTombs: o => EmmaStore.setPhTombstones(o),
      toRow: (p, owner) => ({
        id: p.id, user_id: owner, entry_id: p.entryId || null, activity_id: p.activityId || null,
        date: p.date || null, title: p.title || null, description: p.description || null, tags: arr(p.tags),
        storage_provider: p.storageProvider || 'google_drive', drive_folder_id: p.driveFolderId || null,
        drive_file_id: p.driveFileId || null, drive_url: p.driveUrl || null,
        thumbnail_url: p.thumbnailUrl || null, thumbnail_updated_at: p.thumbnailUpdatedAt || null,
        mime_type: p.mimeType || null, file_name: p.fileName || null, file_size: p.fileSize || null,
        width: p.width || null, height: p.height || null, is_favorite: !!p.isFavorite,
        created_at: p.createdAt || null, updated_at: p.updatedAt || new Date().toISOString(), deleted: false
      }),
      fromRow: r => ({
        id: r.id, entryId: r.entry_id || null, activityId: r.activity_id || null, date: r.date || '',
        title: r.title || '', description: r.description || '', tags: r.tags || [],
        storageProvider: r.storage_provider || 'google_drive', driveFolderId: r.drive_folder_id || '',
        driveFileId: r.drive_file_id || '', driveUrl: r.drive_url || '', thumbnailUrl: r.thumbnail_url || '',
        thumbnailUpdatedAt: r.thumbnail_updated_at || '', mimeType: r.mime_type || '', fileName: r.file_name || '',
        fileSize: r.file_size || 0, width: r.width || 0, height: r.height || 0, isFavorite: !!r.is_favorite,
        createdAt: r.created_at || '', updatedAt: r.updated_at || ''
      })
    },
    { // emma_entry_analysis (solo lectura desde el cliente; lo escribe la Edge Function)
      path: '/rest/v1/emma_entry_analysis',
      pullOnly: true,
      localAll: () => EmmaStore.getAnalyses(),
      setAll: a => EmmaStore._setAnalysesRaw(a),
      tombs: () => ({}), setTombs: () => {},
      fromRow: r => ({ id: r.id, entryId: r.entry_id, analysis_json: r.analysis_json,
        model_used: r.model_used || '', input_tokens: r.input_tokens || 0, output_tokens: r.output_tokens || 0,
        estimated_cost: r.estimated_cost || 0, createdAt: r.created_at || '', updatedAt: r.created_at || '' })
    },
    { // emma_expenses (gastos en S/)
      path: '/rest/v1/emma_expenses',
      localAll: () => EmmaStore.getExpenses(),
      setAll: a => EmmaStore._setExpensesRaw(a),
      tombs: () => EmmaStore.getExpTombstones(),
      setTombs: o => EmmaStore.setExpTombstones(o),
      toRow: (e, owner) => ({
        id: e.id, user_id: owner, entry_id: e.entryId || null, date: e.date || null,
        amount: Number(e.amount) || 0, category: e.category || null, description: e.description || null,
        receipt_photo_id: e.receiptPhotoId || null,
        created_at: e.createdAt || null, updated_at: e.updatedAt || new Date().toISOString(), deleted: false
      }),
      fromRow: r => ({
        id: r.id, entryId: r.entry_id || null, date: r.date || '', amount: Number(r.amount) || 0,
        category: r.category || '', description: r.description || '', receiptPhotoId: r.receipt_photo_id || '',
        createdAt: r.created_at || '', updatedAt: r.updated_at || ''
      })
    }
  ];

  /* ============================================================
     SYNC de UNA tabla:  pull (fusiona) -> push
     ============================================================ */
  async function syncTable(t) {
    // PULL
    const r = await _authFetch(t.path + '?select=*', { method: 'GET' });
    const remote = await r.json();
    const local = t.localAll();
    const tomb = t.tombs();
    const byId = {}; local.forEach(o => byId[o.id] = o);

    remote.forEach(row => {
      const rTs = row.updated_at || '';
      if (row.deleted) {
        if (byId[row.id] && (byId[row.id].updatedAt || '') <= rTs) delete byId[row.id];
        if (!tomb[row.id] || tomb[row.id] < rTs) tomb[row.id] = rTs;
      } else {
        if (tomb[row.id] && tomb[row.id] >= rTs) return; // borrado local más reciente
        const l = byId[row.id];
        if (!l || rTs > (l.updatedAt || '')) byId[row.id] = t.fromRow(row);
      }
    });
    t.setAll(Object.values(byId));
    t.setTombs(tomb);

    if (t.pullOnly) return; // tablas de solo lectura (ej. análisis de IA)

    // PUSH
    const owner = session.user_id;
    const live = t.localAll().map(o => t.toRow(o, owner));
    if (live.length) {
      await _authFetch(t.path, { method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(live) });
    }
    const deadIds = Object.keys(tomb);
    if (deadIds.length) {
      const dead = deadIds.map(id => ({ id, user_id: owner, updated_at: tomb[id], deleted: true }));
      await _authFetch(t.path, { method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(dead) });
    }
  }

  /* ---------- Arranque ---------- */
  window.EmmaSync = EmmaSync;
  if (!CONFIGURED) _setState('local');
  else if (!EmmaSync.isSignedIn()) _setState('signed-out');
  else { _setState(navigator.onLine ? 'syncing' : 'offline'); setTimeout(() => EmmaSync.sync(), 300); }
  window.addEventListener('online', () => { if (EmmaSync.isSignedIn()) EmmaSync.sync(); });
  window.addEventListener('offline', () => _setState('offline'));
})();
