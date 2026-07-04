/* ============================================================
   photos.js  ·  Galería de Emma + Google Drive
   ------------------------------------------------------------
   - Los ARCHIVOS viven en Google Drive (carpeta de Emma).
   - En Supabase/localStorage solo va la METADATA (emma_photos).
   - Subida directa desde el navegador con Google Identity Services
     y scope MÍNIMO 'drive.file' (solo archivos creados por la app).
     No hay client secret ni tokens persistidos: el token vive en
     memoria y se pide consentimiento cuando hace falta.
   - Sin Client ID configurado, la Galería funciona en modo
     "pegar enlace de Drive" (Fase 1). Ver PHOTOS.md.
   ============================================================ */
const EmmaPhotos = (function () {
  const CFG = window.SUPABASE_CONFIG || {};
  const FOLDER_ID = CFG.GOOGLE_DRIVE_PHOTOS_FOLDER_ID || '';
  const CLIENT_ID = CFG.GOOGLE_CLIENT_ID || '';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';
  const MAX_W = 1600;

  let token = null, tokenExp = 0, email = '', tokenClient = null, gisReady = false;
  const thumbCache = {}; // fileId -> objectURL (en memoria, no localStorage)

  function driveEnabled() { return !!CLIENT_ID; }
  function isConnected() { return !!token && Date.now() < tokenExp - 60000; }
  function account() { return email; }
  function status() {
    if (!CLIENT_ID) return { estado: 'no-config' };
    if (isConnected()) return { estado: 'conectado', email, folder: CFG.GOOGLE_DRIVE_PHOTOS_FOLDER_PATH, folderId: FOLDER_ID };
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

  async function connect() {
    if (!CLIENT_ID) throw new Error('Falta GOOGLE_CLIENT_ID (ver PHOTOS.md)');
    await loadGIS();
    return new Promise((resolve, reject) => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID, scope: SCOPE,
          callback: async (resp) => {
            if (resp.error) return reject(new Error(resp.error));
            token = resp.access_token; tokenExp = Date.now() + (resp.expires_in || 3600) * 1000;
            try { email = await fetchEmail(); } catch (e) {}
            resolve(true);
          }
        });
        tokenClient.requestAccessToken({ prompt: isConnected() ? '' : 'consent' });
      } catch (e) { reject(e); }
    });
  }
  function disconnect() {
    try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; tokenExp = 0; email = '';
    Object.values(thumbCache).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
  }
  async function ensureToken() { if (isConnected()) return token; await connect(); return token; }
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
  async function driveUpload(blob, fileName) {
    await ensureToken();
    const metadata = { name: fileName, parents: [FOLDER_ID], mimeType: 'image/jpeg' };
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

  /* ---------- API pública ---------- */
  // Sube un archivo y guarda la metadata (requiere Drive conectado)
  async function addFromFile(file, meta, onState) {
    onState = onState || function () {};
    meta = meta || {};
    onState('Optimizando foto…');
    const { blob, width, height } = await optimize(file);
    const fileName = nombreArchivo(meta.date);
    onState('Subiendo a Drive…');
    const up = await driveUpload(blob, fileName);
    const driveUrl = up.webViewLink || ('https://drive.google.com/file/d/' + up.id + '/view');
    onState('Guardando en la app…');
    const photo = EmmaStore.savePhoto({
      entryId: meta.entryId || null, activityId: meta.activityId || null,
      date: meta.date || new Date().toISOString().slice(0, 10),
      title: meta.title || '', description: meta.description || '', tags: meta.tags || [],
      storageProvider: 'google_drive', driveFolderId: FOLDER_ID, driveFileId: up.id, driveUrl,
      mimeType: 'image/jpeg', fileName, fileSize: blob.size, width, height, isFavorite: !!meta.isFavorite
    });
    onState('Foto guardada');
    return photo;
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
    if (!CLIENT_ID || !isConnected()) return '';
    try {
      const r = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media',
        { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) return '';
      const blob = await r.blob();
      const u = URL.createObjectURL(blob); thumbCache[id] = u; return u;
    } catch (e) { return ''; }
  }

  return { FOLDER_ID, driveEnabled, isConnected, account, status, connect, disconnect,
    addFromFile, addFromLink, getThumb, parseDriveId };
})();
if (typeof window !== 'undefined') window.EmmaPhotos = EmmaPhotos;
