// ============================================================
// Supabase Edge Function: emma-ai
// ------------------------------------------------------------
// Proxy SEGURO hacia OpenAI. Multiusuario:
//   - ai_mode del usuario (tabla user_plans): 'compartida' | 'propia' | 'off'.
//       compartida ? usa la OPENAI_API_KEY del dueno (gratis para ese usuario), con TOPE por usuario.
//       propia     ? usa la key que el usuario mando en el body (userKey).
//       off / sin fila ? IA desactivada (debe poner su propia key o pedir el plan).
//   - Registra uso en ai_usage_logs; guarda analisis en emma_entry_analysis.
//
// Deploy:  supabase functions deploy emma-ai
// Secrets: OPENAI_API_KEY (la del dueno, para modo 'compartida').
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL_ANALYZE = Deno.env.get("OPENAI_MODEL_ANALYZE") ?? "gpt-5.4-nano";
const MODEL_RECOMMEND = Deno.env.get("OPENAI_MODEL_RECOMMEND") ?? "gpt-5.4-nano";
const MODEL_WEEKLY = Deno.env.get("OPENAI_MODEL_WEEKLY") ?? "gpt-5.4-mini";

const PRICE_IN = Number(Deno.env.get("OPENAI_PRICE_IN") ?? "0.00005");
const PRICE_OUT = Number(Deno.env.get("OPENAI_PRICE_OUT") ?? "0.0004");
// Tope de gasto (USD/mes) por usuario cuando usa la key del dueno (modo 'compartida').
const SHARED_MONTHLY_LIMIT = Number(Deno.env.get("AI_SHARED_MONTHLY_LIMIT_USD") ?? "2");
// Tope alto de respaldo para usuarios con su propia key (protege ante errores; ellos pagan).
const OWN_MONTHLY_LIMIT = Number(Deno.env.get("AI_MONTHLY_LIMIT_USD") ?? "50");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function quien(name?: string, gender?: string) {
  const n = (name || "").trim();
  const art = gender === "nino" ? "un nino pequeno" : "una nina pequena";
  return n ? `${art} (${n})` : art;
}
function analyzeSystem(name?: string, gender?: string) {
  return `Eres un extractor de datos. Recibes UNA observacion sobre ${quien(name, gender)}.
Devuelve SOLO JSON valido con esta forma exacta:
{"mood":"","foods":[{"name":"","category":"food","sentiment":"liked|neutral|disliked|unknown","evidence":"","confidence":0}],
"fruits":[{"name":"","sentiment":"liked|neutral|disliked|unknown","evidence":"","confidence":0}],
"activities":[{"name":"","sentiment":"liked|neutral|disliked|unknown","evidence":"","confidence":0}],
"dislikes":[{"name":"","category":"","evidence":"","confidence":0}],
"calming_things":[{"name":"","evidence":"","confidence":0}],
"frustrations":[{"name":"","evidence":"","confidence":0}],
"songs":[{"name":"","sentiment":"liked|neutral|disliked|unknown","confidence":0}],
"new_words":[{"word":"","context":"","confidence":0}],
"places":[{"name":"","sentiment":"liked|neutral|disliked|unknown","evidence":"","confidence":0}],
"people":[{"name":"","evidence":"","confidence":0}],
"important_memory":"","summary":""}
Reglas: responde solo JSON. No des consejos ni diagnosticos. No inventes: si no esta en el texto, deja el array vacio o usa "unknown" con confidence bajo. Extrae solo lo presente. Normaliza nombres simples y en minuscula ("mango","pollo","jugar con agua","la abejita").`;
}
function recommendSystem(name?: string, gender?: string) {
  return `Eres un asistente practico de crianza para ${quien(name, gender)}. Devuelve SOLO JSON: un array de 3 a 5 objetos
[{"title":"","reason":"","duration_minutes":10,"materials":[],"goal":"","steps":[],"why":"","safety_note":"","save_as_entry":{"activity":"","category":""}}].
Usa el perfil (gustos, rechazos, canciones, edad). Actividades apropiadas para su edad. No recomiendes pantallas como actividad principal. Sin texto fuera del JSON. Sin sermones.`;
}
const WEEKLY_SYSTEM = `Analiza los ultimos 7 dias de un nino/a pequeno/a. Devuelve SOLO JSON:
{"changes":[],"patterns":[],"new_likes":[],"new_dislikes":[],"repeat_activities":[],"repeat_foods":[],"watch":[],"recommendations":[]}.
No hagas diagnostico medico. Si algo parece medico o preocupante, incluye en "watch" el texto "considerar consultar con pediatra". Sin texto fuera del JSON.`;

async function monthSpend(sb: any, userId: string): Promise<number> {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data } = await sb.from("ai_usage_logs").select("estimated_cost").eq("user_id", userId).gte("created_at", start.toISOString());
  return (data ?? []).reduce((s: number, r: any) => s + (Number(r.estimated_cost) || 0), 0);
}

async function callOpenAI(apiKey: string, model: string, system: string, user: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "OpenAI error");
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  return { content, usage };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "No autorizado" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "No autorizado" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const { action, payload } = body;
    const userKey: string = (body.userKey || "").trim();
    const childName: string = (body.childName || payload?.childName || "").trim();
    const childGender: string = (body.childGender || payload?.childGender || "");

    // Modo de IA del usuario
    const { data: plan } = await sb.from("user_plans").select("ai_mode").eq("user_id", userId).maybeSingle();
    const mode = plan?.ai_mode || "propia"; // sin fila ? debe usar su propia key

    // Elegir la API key + tope
    let apiKey = "", limit = OWN_MONTHLY_LIMIT;
    if (mode === "off") return json({ error: "La IA esta desactivada para tu cuenta.", blocked: true, ai_mode: mode }, 403);
    if (mode === "compartida") { apiKey = OWNER_OPENAI_KEY; limit = SHARED_MONTHLY_LIMIT; }
    else { // 'propia'
      if (!userKey) return json({ error: "Configura tu propia API key de OpenAI en Ajustes para usar la IA.", need_key: true, ai_mode: mode }, 400);
      apiKey = userKey; limit = OWN_MONTHLY_LIMIT;
    }

    // Tope de gasto mensual (por usuario). Para 'compartida' protege la factura del dueno.
    const spent = await monthSpend(sb, userId);
    if (spent >= limit) return json({ error: "Limite mensual de IA alcanzado.", blocked: true, month_spend: spent, ai_mode: mode }, 402);

    let model = MODEL_ANALYZE, system = analyzeSystem(childName, childGender), userMsg = "";
    if (action === "analyze") { model = MODEL_ANALYZE; system = analyzeSystem(childName, childGender); userMsg = `Fecha: ${payload.date}\nObservacion: ${payload.text}`; }
    else if (action === "recommend") { model = MODEL_RECOMMEND; system = recommendSystem(childName, childGender); userMsg = `Contexto: ${JSON.stringify(payload.context)}\nPerfil: ${JSON.stringify(payload.profile)}`; }
    else if (action === "weekly") { model = MODEL_WEEKLY; system = WEEKLY_SYSTEM; userMsg = `Perfil: ${JSON.stringify(payload.profile)}\nUltimos dias: ${JSON.stringify(payload.recent)}\nNotas importantes: ${JSON.stringify(payload.important_notes)}`; }
    else return json({ error: "Accion no valida" }, 400);

    const { content, usage } = await callOpenAI(apiKey, model, system, userMsg);
    let parsed: any; try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const inTok = usage.prompt_tokens || 0, outTok = usage.completion_tokens || 0;
    const cost = (inTok / 1000) * PRICE_IN + (outTok / 1000) * PRICE_OUT;

    await sb.from("ai_usage_logs").insert({ user_id: userId, feature: action, model, input_tokens: inTok, output_tokens: outTok, estimated_cost: cost });

    if (action === "analyze" && payload.id) {
      await sb.from("emma_entry_analysis").upsert({
        user_id: userId, entry_id: payload.id, analysis_json: parsed, model_used: model,
        input_tokens: inTok, output_tokens: outTok, estimated_cost: cost,
      }, { onConflict: "entry_id" });
    }

    const newSpend = spent + cost;
    if (action === "analyze") return json({ analysis: parsed, model, input_tokens: inTok, output_tokens: outTok, estimated_cost: cost, month_spend: newSpend, ai_mode: mode });
    if (action === "recommend") return json({ recommendations: Array.isArray(parsed) ? parsed : (parsed.recommendations || parsed.items || []), month_spend: newSpend, ai_mode: mode });
    return json({ weekly: parsed, month_spend: newSpend, ai_mode: mode });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
