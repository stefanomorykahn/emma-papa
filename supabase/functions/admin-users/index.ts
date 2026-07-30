// ============================================================
// Supabase Edge Function: admin-users
// ------------------------------------------------------------
// Panel de admin (SOLO el dueno). Con service_role:
//   - list:    lista los usuarios (correo, alta, nombre del nino, modo de IA, gasto del mes).
//   - setMode: cambia el ai_mode de un usuario ('compartida' | 'propia' | 'off').
// Seguridad: verifica que quien llama sea el ADMIN (su user_id). Cualquier otro ? 403.
//
// Deploy:  supabase functions deploy admin-users
// Env opcional: ADMIN_UID (por defecto, el uid del dueno de abajo).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_UID = Deno.env.get("ADMIN_UID") ?? "12ff9a76-30fb-40a7-a9a1-939c7e0fff3a";
const MODES = ["compartida", "propia", "off"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function monthSpend(sb: any, userId: string): Promise<number> {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data } = await sb.from("ai_usage_logs").select("estimated_cost").eq("user_id", userId).gte("created_at", start.toISOString());
  return (data ?? []).reduce((s: number, r: any) => s + (Number(r.estimated_cost) || 0), 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "No autorizado" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "No autorizado" }, 401);
    if (userData.user.id !== ADMIN_UID) return json({ error: "Solo el administrador puede usar esto." }, 403);

    const { action, userId, mode } = await req.json();

    if (action === "list") {
      const { data: list, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return json({ error: error.message }, 500);
      const users = list?.users ?? [];
      const { data: settings } = await sb.from("child_settings").select("user_id,name,gender,birthdate");
      const { data: plans } = await sb.from("user_plans").select("user_id,ai_mode");
      const sMap = new Map((settings ?? []).map((s: any) => [s.user_id, s]));
      const pMap = new Map((plans ?? []).map((p: any) => [p.user_id, p.ai_mode]));
      const out = [];
      for (const u of users) {
        out.push({
          id: u.id, email: u.email || "", created_at: u.created_at,
          childName: sMap.get(u.id)?.name || "", childGender: sMap.get(u.id)?.gender || "",
          ai_mode: pMap.get(u.id) || "propia",
          month_spend: await monthSpend(sb, u.id),
          is_admin: u.id === ADMIN_UID,
        });
      }
      out.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return json({ users: out });
    }

    if (action === "setMode") {
      if (!userId || !MODES.includes(mode)) return json({ error: "Datos invalidos" }, 400);
      const { error } = await sb.from("user_plans").upsert(
        { user_id: userId, ai_mode: mode, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, userId, ai_mode: mode });
    }

    return json({ error: "Accion no valida" }, 400);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
