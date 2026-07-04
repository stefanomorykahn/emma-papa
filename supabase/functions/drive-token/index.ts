// ============================================================
// Supabase Edge Function: drive-token
// ------------------------------------------------------------
// Flujo OAuth de Google Drive con REFRESH TOKEN (del lado del
// servidor) para NO reconectar en cada ingreso.
//
// El navegador obtiene un "authorization code" (popup de Google)
// y lo manda aqui. Esta funcion lo intercambia por access_token +
// refresh_token usando el CLIENT_SECRET (que vive solo aqui), guarda
// el refresh_token en la tabla drive_tokens y devuelve un access_token
// de corta vida. Cuando ese caduca, el navegador pide "refresh" y esta
// funcion usa el refresh_token guardado para dar uno nuevo, sin popup.
//
// Acciones (POST JSON):  { action: "exchange", code, redirect_uri }
//                        { action: "refresh" }
//                        { action: "status" }
//                        { action: "disconnect" }
//
// Deploy:  supabase functions deploy drive-token
// Secrets: supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function googleToken(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, d };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!GOOGLE_CLIENT_SECRET) return json({ error: "Falta configurar GOOGLE_CLIENT_SECRET en la funcion." }, 500);

    // Autenticar al usuario por su JWT de Supabase (para asociar el refresh_token a su cuenta)
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "No autorizado. Inicia sesion." }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "exchange") {
      const code = body.code;
      if (!code) return json({ error: "Falta el code de autorizacion." }, 400);
      const { ok, d } = await googleToken({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: body.redirect_uri || "postmessage",
        grant_type: "authorization_code",
      });
      if (!ok) return json({ error: d.error_description || d.error || "No se pudo intercambiar el code." }, 400);
      // Guarda el refresh_token si Google lo envio (solo llega con access_type=offline y consent).
      if (d.refresh_token) {
        await sb.from("drive_tokens").upsert({
          user_id: userId, refresh_token: d.refresh_token,
          email: userData.user.email ?? null, updated_at: new Date().toISOString(),
        });
      }
      return json({ access_token: d.access_token, expires_in: d.expires_in ?? 3600, saved: !!d.refresh_token });
    }

    if (action === "refresh") {
      const { data: row } = await sb.from("drive_tokens").select("refresh_token").eq("user_id", userId).maybeSingle();
      if (!row?.refresh_token) return json({ error: "no_refresh_token" }, 404);
      const { ok, d } = await googleToken({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: row.refresh_token,
        grant_type: "refresh_token",
      });
      if (!ok) {
        // El refresh_token fue revocado o expiro -> hay que reconectar una vez.
        if (d.error === "invalid_grant") {
          await sb.from("drive_tokens").delete().eq("user_id", userId);
          return json({ error: "invalid_grant" }, 401);
        }
        return json({ error: d.error_description || d.error || "No se pudo renovar el acceso." }, 400);
      }
      return json({ access_token: d.access_token, expires_in: d.expires_in ?? 3600 });
    }

    if (action === "status") {
      const { data: row } = await sb.from("drive_tokens").select("email").eq("user_id", userId).maybeSingle();
      return json({ connected: !!row, email: row?.email ?? null });
    }

    if (action === "disconnect") {
      await sb.from("drive_tokens").delete().eq("user_id", userId);
      return json({ ok: true });
    }

    return json({ error: "Accion desconocida." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
