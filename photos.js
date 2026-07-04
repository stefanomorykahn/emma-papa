/* ============================================================
   photos.js  ·  Galería de Emma + Google Drive
   ------------------------------------------------------------
   - Los ARCHIVOS viven en Google Drive (carpeta de Emma).
   - En Supabase/localStorage solo va la METADATA (emma_photos).
   - Subida directa desde el navegador con Google Identity Services
     y scope 'drive' (para escribir en TU carpeta pre-creada). Sin client
     secret. El token se guarda en localStorage y se renueva SIN interacción
     (prompt vacío) si ya diste consentimiento, para no reconectar seguido.
   - Sin Client ID configurado, la Galería funciona en modo
     "pegar enlace de Drive" (Fase 1). Ver PHOTOS.md.
   ============================================================ */
const EmmaPhotos = (function () {
  const CFG = window.SUPABASE_CONFIG || {};
  const FOLDER_ID = CFG.GOOGLE_DRIVE_PHOTOS_FOLDER_ID || '';
  const CLIENT_ID = CFG.GOOGLE_CLIENT_ID || '';
  // Acceso completo a Drive: permite subir a TU carpeta pre-creada (no solo a las que
  // crea la app). Viable sin verificación de Google porque el OAuth es "Interno".
  const SCOPE = 'https://www.googleapis.com/auth/drive openid email profile';
  const MAX_W = 1600;

  let token = null, tokenExp = 0, email = '', tokenClient = null, gisReady = false, consented = false;
  const thumbCache = {}; // fileId -> objectURL (en memoria, no localStorage)
  const LS_DRIVE = 'emmaDrive';
  // Se persiste el token (localStorage) para NO reconectar en cada recarga. Es un token
  // Bearer de corta vida (~1h) y se renueva SIN interacción si ya diste consentimiento.
  function _persist() { try { localStorage.setItem(LS_DRIVE, JSON.stringify({ token, tokenExp, email, consented })); } catch (e) {} }
  function _restore() { try { const d = JSON.parse(localStorage.getItem(LS_DRIVE)); if (d) { token = d.token || null; tokenExp = d.tokenExp || 0; email = d.email || ''; consented = !!d.consented; } } catch (e) {} }
  _restore();

  // Traduce errores de GIS/Drive a mensajes claros en español.
  function errMsg(e) {
    const s = String((e && (e.message || e.type || e.error)) || e || '').toLowerCase();
    if (/origin|idpiframe|not[_ ]?allowed|redirect_uri|invalid_client|unregistered/.test(s))
      return "El dominio no está autorizado en Google Cloud. Agrega https://stefanomorykahn.github.io en 'Authorized JavaScript origins'.";
    if (/\b403\b|insufficient|permission_denied|api has not been|accessnotconfigured|not.?enabled|disabled/.test(s))
      return "Falta habilitar Google Drive API o tu correo no está en 'Test users'.";
    if (/access_denied|popup_closed|user_cancel|dismiss|denied|cancel/.test(s))
      return "Permiso cancelado. Vuelve a intentar.";
    const raw = (e && e.message) ? e.message : String(e || 'error');
    return "Error de Drive: " + raw;
  }
  function _toast(m) { try { if (typeof window !== 'undefined' && typeof window.toast === 'function') window.toast(m); } catch (e) {} }

  function driveEnabled() { return !!CLIENT_ID; }
  function isConnected() { return !!token && Date.now() < tokenExp - 60000; }
  function account() { return email; }
  function status() {
    if (!CLIENT_ID) return { estado: 'no-config' };
    if (isConnected() || consented) return { estado: 'conectado', email, folder: CFG.GOOGLE_DRIVE_PHOTOS_FOLDER_PATH, folderId: FOLDER_ID };
    return { estado: 'desconectado' };
  }

  /* ---------- Google Identity Services ---------- */
  function loadGIS() {
    return new Promise((res, rej) => {
      if (gisReady && window.google && google.accounts) return res();
      const ready = () => (window.google && google.accounts && google.accounts.oauth2);
      if (ready()) { gisReady = true; return res(); }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = () => { gisReady = true; res(); };
      s.onerror = () => rej(new Error('No se pudo cargar Google Identity Services'));
      document.head.appendChild(s);
    });
  }

  // Pide un token a Google. prompt:'' = SIN interacción (silencioso, si ya consentiste);
  // prompt:'consent' = muestra el diálogo de permisos (requiere gesto del usuario).
  function requestToken(prompt) {
    return loadGIS().then(() => new Promise((resolve, reject) => {
      let done = false; const fin = (fn, a) => { if (!done) { done = true; fn(a); } };
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token) {
            token = resp.access_token; tokenExp = Date.now() + (resp.expires_in || 3600) * 1000; consented = true; _persist();
            fetchEmail().then(e => { email = e; _persist(); }).catch(() => {});
            fin(resolve, token);
            setTimeout(() => { try { flushQueue(); } catch (e) {} }, 500); // sube pendientes al reconectar
          } else { fin(reject, new Error((resp && resp.error) || 'sin_token')); }
        },
        error_callback: (err) => fin(reject, new Error((err && err.type) || 'oauth_error'))
      });
      setTimeout(() => fin(reject, new Error('timeout')), 90000);
      tokenClient.requestAccessToken({ prompt: prompt });
    }));
  }
  // Conexión iniciada por el usuario (botón). Si ya consentiste, intenta silencioso; si no, pide consent.
  async function connect(onState) {
    onState = onState || function () {};
    if (!CLIENT_ID) { const m = 'Falta GOOGLE_CLIENT_ID (ver PHOTOS.md)'; _toast(m); throw new Error(m); }
    onState('Conectando con Google…');
    // Si en 8s no hubo respuesta, probablemente el popup no abrió (pop-ups bloqueados).
    let listo = false;
    const aviso = setTimeout(() => { if (!listo) _toast('No se abrió la ventana de Google (¿pop-ups bloqueados?)'); }, 8000);
    try {
      let tok = null;
      if (consented) { try { tok = await requestToken(''); } catch (e) { /* silencioso falló → pedir consent */ } }
      if (!tok) tok = await requestToken('consent');
      listo = true; clearTimeout(aviso);
      onState('Google Drive conectado ✓');
      setTimeout(() => { try { flushQueue(); } catch (e) {} }, 300); // reintenta la última subida pendiente
      return tok;
    } catch (e) {
      listo = true; clearTimeout(aviso);
      throw new Error(errMsg(e)); // el caller muestra el toast (evita duplicar)
    }
  }
  function disconnect() {
    try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; tokenExp = 0; email = ''; consented = false;
    try { localStorage.removeItem(LS_DRIVE); } catch (e) {}
    Object.values(thumbCache).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
  }
  // Garantiza un token válido SIN molestar: si caducó pero ya consentiste, lo renueva en silencio.
  async function ensureToken() {
    if (isConnected()) return token;
    if (consented) { try { return await requestToken(''); } catch (e) {} }
    throw new Error('Conecta Google Drive primero');
  }
  async function fetchEmail() {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return ''; const d = await r.json(); return d.email || '';
  }

  /* ---------- Optimizar imagen antes de subir ---------- */
  function optimize(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(b => { URL.revokeObjectURL(url); res({ blob: b, width: w, height: h }); }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Imagen no válida')); };
      img.src = url;
    });
  }

  function nombreArchivo(date) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const fecha = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '-');
    return `emma_${fecha}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.jpg`;
  }

  /* ---------- Subir a Drive (multipart) ---------- */
  /* ---------- Subcarpetas por categoría (Fotos de Emma / Boletas y pagos) ---------- */
  const _subCache = {};
  function _esBoletaMeta(meta) { return ((meta && meta.tags) || []).some(t => /boleta|gasto|pago/i.test(String(t))); }
  function subfolderPara(meta) { return _esBoletaMeta(meta) ? 'Boletas y pagos' : 'Fotos de Emma'; }
  async function ensureSubfolder(nombre) {
    await ensureToken();
    if (_subCache[nombre]) return _subCache[nombre];
    const q = encodeURIComponent(`name='${nombre}' and '${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const r = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&spaces=drive', { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) { const d = await r.json(); if (d.files && d.files[0]) { _subCache[nombre] = d.files[0].id; return d.files[0].id; } }
    const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [FOLDER_ID] }) });
    if (!cr.ok) throw new Error('No se pudo crear la subcarpeta');
    const cd = await cr.json(); _subCache[nombre] = cd.id; return cd.id;
  }
  // Reorganiza las fotos YA subidas: mueve cada una a su subcarpeta según su categoría.
  async function organizarDrive(onProgress) {
    onProgress = onProgress || function () {};
    await ensureToken();
    const emmaSub = await ensureSubfolder('Fotos de Emma');
    const boletaSub = await ensureSubfolder('Boletas y pagos');
    const fotos = (EmmaStore.getPhotos() || []).filter(p => p.driveFileId && !p.deleted);
    let movidas = 0;
    for (let i = 0; i < fotos.length; i++) {
      const p = fotos[i]; onProgress(i + 1, fotos.length);
      const destino = _esBoletaMeta(p) ? boletaSub : emmaSub;
      if (p.driveFolderId === destino) continue;
      try {
        const g = await fetch('https://www.googleapis.com/drive/v3/files/' + p.driveFileId + '?fields=parents', { headers: { Authorization: 'Bearer ' + token } });
        if (!g.ok) continue;
        const gd = await g.json(); const viejos = (gd.parents || []).filter(x => x !== destino).join(',');
        const u = await fetch('https://www.googleapis.com/drive/v3/files/' + p.driveFileId + '?addParents=' + destino + (viejos ? '&removeParents=' + viejos : '') + '&fields=id', { method: 'PATCH', headers: { Authorization: 'Bearer ' + token } });
        if (u.ok) { EmmaStore.updatePhoto(p.id, { driveFolderId: destino }); movidas++; }
      } catch (e) {}
    }
    return movidas;
  }

  async function driveUpload(blob, fileName, parentId) {
    await ensureToken();
    const metadata = { name: fileName, parents: [parentId || FOLDER_ID], mimeType: 'image/jpeg' };
    const boundary = 'emma_' + Math.random().toString(36).slice(2);
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const body = new Blob([head, blob, tail], { type: 'multipart/related; boundary=' + boundary });
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }, body
    });
    if (!r.ok) { const e = await r.text(); throw new Error('Drive: ' + e.slice(0, 120)); }
    return r.json(); // { id, webViewLink }
  }

  /* ---------- Cola de subidas pendientes (IndexedDB) ----------
     Si una foto falla al subir (sin señal / Drive caído), NO se pierde: queda en cola y
     se reintenta sola al reconectar, al volver la señal, o al abrir la app. */
  function _idbOpen() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('emmaPhotosDB', 1);
      r.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' }); };
      r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error);
    });
  }
  function _qPut(item) { return _idbOpen().then(db => new Promise((res, rej) => { const tx = db.transaction('queue', 'readwrite'); tx.objectStore('queue').put(item); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); })); }
  function _qAll() { return _idbOpen().then(db => new Promise((res, rej) => { const tx = db.transaction('queue', 'readonly'); const rq = tx.objectStore('queue').getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); })); }
  function _qDel(id) { return _idbOpen().then(db => new Promise((res, rej) => { const tx = db.transaction('queue', 'readwrite'); tx.objectStore('queue').delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); })); }

  async function _uploadAndSave(blob, fileName, meta, width, height) {
    let parent = FOLDER_ID;
    try { parent = await ensureSubfolder(subfolderPara(meta)); } catch (e) {} // si falla, va a la carpeta raíz
    const up = await driveUpload(blob, fileName, parent);
    const driveUrl = up.webViewLink || ('https://drive.google.com/file/d/' + up.id + '/view');
    return EmmaStore.savePhoto({
      entryId: meta.entryId || null, activityId: meta.activityId || null,
      date: meta.date || new Date().toISOString().slice(0, 10),
      title: meta.title || '', description: meta.description || '', tags: meta.tags || [],
      storageProvider: 'google_drive', driveFolderId: parent, driveFileId: up.id, driveUrl,
      mimeType: 'image/jpeg', fileName, fileSize: blob.size, width, height, isFavorite: !!meta.isFavorite
    });
  }

  let flushing = false;
  async function flushQueue() {
    if (flushing || !CLIENT_ID) return 0;
    let items; try { items = await _qAll(); } catch (e) { return 0; }
    if (!items.length) return 0;
    try { await ensureToken(); } catch (e) { return 0; } // sin Drive → reintentar luego
    flushing = true; let subidas = 0;
    for (const it of items) {
      try { await _uploadAndSave(it.blob, it.fileName, it.meta, it.width, it.height); await _qDel(it.id); subidas++; }
      catch (e) { it.attempts = (it.attempts || 0) + 1; try { await _qPut(it); } catch (e2) {} }
    }
    flushing = false;
    if (subidas && typeof window.onPhotosFlushed === 'function') { try { window.onPhotosFlushed(subidas); } catch (e) {} }
    return subidas;
  }
  async function queueCount() { try { return (await _qAll()).length; } catch (e) { return 0; } }

  // Reintenta la cola al volver la señal y cada 3 min; y poco después de cargar.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => flushQueue());
    setTimeout(() => flushQueue(), 4000);
    setInterval(() => flushQueue(), 3 * 60 * 1000);
    // Al abrir la app, si ya conectaste Drive antes, renueva el acceso EN SILENCIO (sin popup)
    // para no tener que reconectar en cada ingreso.
    if (consented) setTimeout(() => { ensureToken().catch(() => {}); }, 1500);
    // Y también al volver a la app (reabrir/cambiar de pestaña).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && consented && !isConnected()) ensureToken().catch(() => {});
    });
  }

  /* ---------- Backup a Drive (JSON) ---------- */
  // Sube o ACTUALIZA un archivo de texto en la carpeta de Drive (para el auto-backup).
  async function driveUploadText(text, fileName, mime) {
    await ensureToken(); mime = mime || 'application/json';
    let existingId = '';
    try {
      const q = encodeURIComponent(`name='${fileName}' and '${FOLDER_ID}' in parents and trashed=false`);
      const r0 = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&spaces=drive', { headers: { Authorization: 'Bearer ' + token } });
      if (r0.ok) { const d = await r0.json(); if (d.files && d.files[0]) existingId = d.files[0].id; }
    } catch (e) {}
    const boundary = 'emma_' + Math.random().toString(36).slice(2);
    const metadata = existingId ? {} : { name: fileName, parents: [FOLDER_ID] };
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const body = new Blob([head, text, tail], { type: 'multipart/related; boundary=' + boundary });
    const url = existingId
      ? ('https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=multipart&fields=id')
      : ('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
    const r = await fetch(url, { method: existingId ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + token }, body });
    if (!r.ok) throw new Error('Drive backup: ' + (await r.text()).slice(0, 100));
    return r.json();
  }

  /* ---------- API pública ---------- */
  // Sube un archivo y guarda la metadata (requiere Drive conectado)
  async function addFromFile(file, meta, onState) {
    onState = onState || function () {};
    meta = meta || {};
    onState('Optimizando foto…');
    const { blob, width, height } = await optimize(file);
    const fileName = nombreArchivo(meta.date);
    try {
      onState('Subiendo foto…');
      const photo = await _uploadAndSave(blob, fileName, meta, width, height);
      onState('Foto guardada ✓');
      flushQueue(); // de paso, reintenta pendientes
      return photo;
    } catch (e) {
      // NO perder la foto: a la cola para reintentar sola después.
      try { await _qPut({ id: (EmmaStore.uuid ? EmmaStore.uuid() : ('q' + Date.now() + Math.random().toString(36).slice(2))), blob, fileName, meta, width, height, createdAt: Date.now(), attempts: 0 }); } catch (e2) {}
      // Si es problema de permisos/configuración (no de red), avísalo claro para poder arreglarlo.
      const s = String((e && e.message) || '').toLowerCase();
      if (/origin|idpiframe|not[_ ]?allowed|\b403\b|insufficient|permission_denied|access_denied|invalid|token|conecta/.test(s)) {
        const m = errMsg(e); onState(m); _toast(m);
      } else {
        onState('Guardada · se subirá luego');
      }
      if (typeof window.onPhotoQueued === 'function') { try { window.onPhotoQueued(); } catch (e3) {} }
      return { queued: true };
    }
  }

  // Guarda solo metadata a partir de un enlace de Drive (Fase 1, sin OAuth)
  function addFromLink(url, meta) {
    meta = meta || {};
    const id = parseDriveId(url);
    return EmmaStore.savePhoto({
      entryId: meta.entryId || null, activityId: meta.activityId || null,
      date: meta.date || new Date().toISOString().slice(0, 10),
      title: meta.title || '', description: meta.description || '', tags: meta.tags || [],
      storageProvider: 'google_drive', driveFolderId: FOLDER_ID, driveFileId: id || '', driveUrl: url,
      mimeType: '', fileName: '', fileSize: 0, isFavorite: !!meta.isFavorite
    });
  }

  function parseDriveId(url) {
    if (!url) return '';
    const m = String(url).match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
    return m ? (m[1] || m[2]) : '';
  }

  // Obtiene una miniatura mostrable (objectURL en memoria) o '' si no se puede
  async function getThumb(photo) {
    const id = photo.driveFileId;
    if (!id) return '';
    if (thumbCache[id]) return thumbCache[id];
    if (!CLIENT_ID) return '';
    try { await ensureToken(); } catch (e) { return ''; } // renueva en silencio si hace falta
    try {
      const r = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media',
        { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) return '';
      const blob = await r.blob();
      const u = URL.createObjectURL(blob); thumbCache[id] = u; return u;
    } catch (e) { return ''; }
  }

  return { FOLDER_ID, driveEnabled, isConnected, account, status, connect, disconnect,
    addFromFile, addFromLink, getThumb, parseDriveId, flushQueue, queueCount, driveUploadText, ensureToken, organizarDrive, ensureSubfolder, errMsg };
})();
if (typeof window !== 'undefined') window.EmmaPhotos = EmmaPhotos;
