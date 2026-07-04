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
  SUPABASE_URL:      'https://coxescprzaqxxlcjeggq.supabase.co',   // ej: 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNveGVzY3ByemFxeHhsY2plZ2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMzgzMTQsImV4cCI6MjA5ODcxNDMxNH0.zqQbK0SWhaXlsKhtM6mYT4uNbCL6jX4MqDIWhtZcyYI',   // ej: 'eyJhbGciOi...'  (clave anon public, no la service_role)

  // ---- IA (OpenAI vía Edge Function) · OPCIONAL ----
  // Ponlo en true SOLO después de desplegar la Edge Function "emma-ai" (ver AI.md).
  AI_ENABLED: true,
  AI_MONTHLY_LIMIT_USD: 50,  // tope de gasto mensual (informativo; el real lo aplica la Edge Function)

  // ---- Google Drive (Galería de fotos) · OPCIONAL ----
  // Carpeta destino de las fotos de Emma (ya creada).
  GOOGLE_DRIVE_PHOTOS_FOLDER_ID: '1XGWN6wxXMMqBgDt189hEf6Pz7_d1poqv',
  GOOGLE_DRIVE_PHOTOS_FOLDER_PATH: 'Personal / Emma / 02 Fotos / Emma & Papa',
  // Para SUBIR fotos desde la app necesitas un OAuth Client ID de Google
  // (tipo "Web application", scope drive.file). Ver PHOTOS.md.
  // Si lo dejas vacío, la Galería funciona en modo "pegar enlace de Drive".
  GOOGLE_CLIENT_ID: '835915710116-ae84q6hbvda02udi1lbrtj9g7kka1his.apps.googleusercontent.com'
};
