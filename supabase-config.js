/* ============================================================
   supabase-config.js  ·  Configuración de la nube (OPCIONAL)
   ------------------------------------------------------------
   - Si dejas los campos VACÍOS, la app funciona 100% local
     (localStorage), exactamente como antes. Nada cambia.
   - Si pegas tu URL y tu clave "anon", la app pedirá iniciar
     sesión y sincronizará los datos de Emma con Supabase.

   Dónde encontrar estos datos (ver SUPABASE.md):
   Supabase → tu proyecto → Project Settings → API
     • Project URL         -> SUPABASE_URL
     • Project API keys → anon public -> SUPABASE_ANON_KEY
   ============================================================ */
window.SUPABASE_CONFIG = {
  SUPABASE_URL:      '',   // ej: 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: '',   // ej: 'eyJhbGciOi...'  (clave anon public, no la service_role)

  // ---- IA (OpenAI vía Edge Function) · OPCIONAL ----
  // Ponlo en true SOLO después de desplegar la Edge Function "emma-ai" (ver AI.md).
  AI_ENABLED: false,
  AI_MONTHLY_LIMIT_USD: 50,  // tope de gasto mensual (informativo; el real lo aplica la Edge Function)

  // ---- Google Drive (Galería de fotos) · OPCIONAL ----
  // Carpeta destino de las fotos de Emma (ya creada).
  GOOGLE_DRIVE_PHOTOS_FOLDER_ID: '1XGWN6wxXMMqBgDt189hEf6Pz7_d1poqv',
  GOOGLE_DRIVE_PHOTOS_FOLDER_PATH: 'Personal / Emma / 02 Fotos / Emma & Papa',
  // Para SUBIR fotos desde la app necesitas un OAuth Client ID de Google
  // (tipo "Web application", scope drive.file). Ver PHOTOS.md.
  // Si lo dejas vacío, la Galería funciona en modo "pegar enlace de Drive".
  GOOGLE_CLIENT_ID: ''
};
