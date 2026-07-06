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
  // Scope MÍNIMO (Opción A): la app solo accede a los archivos/carpetas que ELLA crea,
  // no a todo tu Drive. Para eso, la app crea su propia carpeta "Emma & Papá Fotos" y sube ahí.
  const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';
  const APP_FOLDER_NAME = 'Emma & Papá Fotos';
  const LS_FOLDER = 'emmaDriveFolder';
  const SUPA_URL = CFG.SUPABASE_URL || '';
  const SUPA_ANON = CFG.SUPABASE_ANON_KEY || '';
  const FN_URL = SUPA_URL ? (SUPA_URL.replace(/\/$/, '') + '/functions/v1/drive-token') : '';
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
    if (isConnected() || consented) return { estado: 'conectado', email, folder: APP_FOLDER_NAME, folderId: appFolderId };
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

  // Llama a la Edge Function drive-token (guarda/renueva el refresh_token del lado del servidor).
  async function _fn(action, extra) {
    if (!FN_URL) throw new Error('Falta configurar Supabase para Google Drive.');
    const jwt = (window.EmmaSync && EmmaSync.accessToken && EmmaSync.accessToken()) || '';
    if (!jwt) { const e = new Error('Inicia sesión para conectar Google Drive.'); e.code = 'no_login'; throw e; }
    const r = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + jwt, 'apikey': SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('drive-token ' + r.status)); e.code = d.error; throw e; }
    return d;
  }

  // Abre el popup de Google y devuelve un "authorization code" para canjearlo por refresh_token en el backend.
  let codeClient = null;
  function _getCode() {
    return loadGIS().then(() => new Promise((resolve, reject) => {
      let done = false; const fin = (fn, a) => { if (!done) { done = true; fn(a); } };
      codeClient = google.accounts.oauth2.initCodeClient({
        client_id: CLIENT_ID, scope: SCOPE, ux_mode: 'popup',
        callback: (resp) => { if (resp && resp.code) fin(resolve, resp.code); else fin(reject, new Error((resp && resp.error) || 'sin_code')); },
        error_callback: (err) => fin(reject, new Error((err && err.type) || 'oauth_error')),
      });
      setTimeout(() => fin(reject, new Error('timeout')), 90000);
      codeClient.requestCode();
    }));
  }
  // Conexión iniciada por el usuario (botón). Popup de Google → code → el backend guarda el refresh_token.
  // Con eso, conectas UNA sola vez: después el acceso se renueva solo (sin popup ni reconexiones).
  async function connect(onState) {
    onState = onState || function () {};
    if (!CLIENT_ID) { const m = 'Falta GOOGLE_CLIENT_ID (ver PHOTOS.md)'; _toast(m); throw new Error(m); }
    onState('Conectando con Google…');
    // Si en 8s no hubo respuesta, probablemente el popup no abrió (pop-ups bloqueados).
    let listo = false;
    const aviso = setTimeout(() => { if (!listo) _toast('No se abrió la ventana de Google (¿pop-ups bloqueados?)'); }, 8000);
    try {
      const code = await _getCode();                                        // popup → authorization code
      listo = true; clearTimeout(aviso);
      onState('Guardando conexión…');
      const d = await _fn('exchange', { code: code, redirect_uri: 'postmessage' });  // backend guarda el refresh_token
      token = d.access_token; tokenExp = Date.now() + ((d.expires_in || 3600) * 1000); consented = true; _persist();
      fetchEmail().then(e => { email = e; _persist(); }).catch(() => {});
      onState('Google Drive conectado ✓');
      setTimeout(() => { try { flushQueue(); } catch (e) {} }, 300); // reintenta la última subida pendiente
      return token;
    } catch (e) {
      listo = true; clearTimeout(aviso);
      throw new Error(errMsg(e)); // el caller muestra el toast (evita duplicar)
    }
  }
  function disconnect() {
    try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    try { _fn('disconnect').catch(() => {}); } catch (e) {} // borra el refresh_token guardado en el backend
    token = null; tokenExp = 0; email = ''; consented = false;
    appFolderId = ''; _subCache && Object.keys(_subCache).forEach(k => delete _subCache[k]);
    try { localStorage.removeItem(LS_DRIVE); localStorage.removeItem(LS_FOLDER); } catch (e) {}
    Object.values(thumbCache).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
  }
  // Garantiza un access_token válido SIN molestar: si caducó pero ya conectaste, el backend lo
  // renueva con el refresh_token guardado (sin popup). Solo pide reconectar si el refresh fue revocado.
  async function ensureToken() {
    if (isConnected()) return token;
    if (consented) {
      try {
        const d = await _fn('refresh');
        token = d.access_token; tokenExp = Date.now() + ((d.expires_in || 3600) * 1000); _persist();
        return token;
      } catch (e) {
        if (e.code === 'invalid_grant' || e.code === 'no_refresh_token') { consented = false; _persist(); }
        throw new Error('Conecta Google Drive primero');
      }
    }
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
  // Carpeta PROPIA de la app: con drive.file la app sí puede escribir en lo que ella misma crea.
  let appFolderId = ''; try { appFolderId = localStorage.getItem(LS_FOLDER) || ''; } catch (e) {}
  function _saveFolder() { try { localStorage.setItem(LS_FOLDER, appFolderId); } catch (e) {} }
  async function ensureAppFolder() {
    await ensureToken();
    if (appFolderId) return appFolderId;
    // ¿ya la creamos antes? (con drive.file, files.list solo devuelve lo que la app creó)
    try {
      const q = encodeURIComponent(`name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const r = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&spaces=drive', { headers: { Authorization: 'Bearer ' + token } });
      if (r.ok) { const d = await r.json(); if (d.files && d.files[0]) { appFolderId = d.files[0].id; _saveFolder(); return appFolderId; } }
    } catch (e) {}
    const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }) });
    if (!cr.ok) throw new Error('No se pudo crear la carpeta en Drive: ' + (await cr.text()).slice(0, 120));
    const cd = await cr.json(); appFolderId = cd.id; _saveFolder(); return appFolderId;
  }
  async function ensureSubfolder(nombre) {
    const root = await ensureAppFolder();
    if (_subCache[nombre]) return _subCache[nombre];
    const q = encodeURIComponent(`name='${nombre}' and '${root}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const r = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&spaces=drive', { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) { const d = await r.json(); if (d.files && d.files[0]) { _subCache[nombre] = d.files[0].id; return d.files[0].id; } }
    const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [root] }) });
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
    const metadata = { name: fileName, parents: [parentId || appFolderId], mimeType: 'image/jpeg' };
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
    let parent = await ensureAppFolder();
    try { parent = await ensureSubfolder(subfolderPara(meta)); } catch (e) {} // si falla, va a la carpeta raíz de la app
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
    const root = await ensureAppFolder(); mime = mime || 'application/json';
    let existingId = '';
    try {
      const q = encodeURIComponent(`name='${fileName}' and '${root}' in parents and trashed=false`);
      const r0 = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&spaces=drive', { headers: { Authorization: 'Bearer ' + token } });
      if (r0.ok) { const d = await r0.json(); if (d.files && d.files[0]) existingId = d.files[0].id; }
    } catch (e) {}
    const boundary = 'emma_' + Math.random().toString(36).slice(2);
    const metadata = existingId ? {} : { name: fileName, parents: [root] };
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

  // Devuelve la foto como dataURL base64 (para INCRUSTARLA en el reporte imprimible,
  // así no depende de un token de Drive). '' si no se puede. Cachea por fileId.
  const dataUrlCache = {};
  async function getThumbDataURL(photo) {
    const id = photo && photo.driveFileId;
    if (!id) return '';
    if (dataUrlCache[id]) return dataUrlCache[id];
    if (!CLIENT_ID) return '';
    try { await ensureToken(); } catch (e) { return ''; }
    try {
      const r = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media',
        { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) return '';
      const blob = await r.blob();
      const durl = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result || '');
        fr.onerror = () => res('');
        fr.readAsDataURL(blob);
      });
      if (durl) dataUrlCache[id] = durl;
      return durl;
    } catch (e) { return ''; }
  }

  return { FOLDER_ID, driveEnabled, isConnected, account, status, connect, disconnect,
    addFromFile, addFromLink, getThumb, getThumbDataURL, parseDriveId, flushQueue, queueCount, driveUploadText, ensureToken, organizarDrive, ensureSubfolder, errMsg };
})();
if (typeof window !== 'undefined') window.EmmaPhotos = EmmaPhotos;
