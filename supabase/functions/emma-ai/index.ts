// ============================================================
// Supabase Edge Function: emma-ai
// ------------------------------------------------------------
// Proxy SEGURO hacia OpenAI. La API key vive solo aquí (secret).
// Acciones: analyze | recommend | weekly.
// - Structured Outputs (JSON) para datos confiables.
// - Registra uso en ai_usage_logs y aplica un tope mensual.
// - Guarda el análisis de entradas en emma_entry_analysis.
//
// Deploy:  supabase functions deploy emma-ai
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Modelos económicos (cámbialos por env si quieres)
const MODEL_ANALYZE = Deno.env.get("OPENAI_MODEL_ANALYZE") ?? "gpt-5.4-nano";
const MODEL_RECOMMEND = Deno.env.get("OPENAI_MODEL_RECOMMEND") ?? "gpt-5.4-nano";
const MODEL_WEEKLY = Deno.env.get("OPENAI_MODEL_WEEKLY") ?? "gpt-5.4-mini";

// Precios aproximados USD por 1K tokens (ajústalos a tu plan)
const PRICE_IN = Number(Deno.env.get("OPENAI_PRICE_IN") ?? "0.00005");
const PRICE_OUT = Number(Deno.env.get("OPENAI_PRICE_OUT") ?? "0.0004");
const MONTHLY_LIMIT = Number(Deno.env.get("AI_MONTHLY_LIMIT_USD") ?? "50");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const ANALYZE_SYSTEM = `Eres un extractor de datos. Recibes UNA observación sobre una niña pequeña (Emma).
Devuelve SOLO JSON válido con esta forma exacta:
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
Reglas: responde solo JSON. No des consejos ni diagnósticos. No inventes: si no está en el texto, deja el array vacío o usa "unknown" con confidence bajo. Extrae solo lo presente. Normaliza nombres simples y en minúscula ("mango","pollo","jugar con agua","la abejita").`;

const RECOMMEND_SYSTEM = `Eres un asistente práctico de crianza para una niña menor de 2 años. Devuelve SOLO JSON: un array de 3 a 5 objetos
[{"title":"","reason":"","duration_minutes":10,"materials":[],"goal":"","steps":[],"why_for_emma":"","safety_note":"","save_as_entry":{"activity":"","category":""}}].
Usa el perfil (gustos, rechazos, canciones, edad). Actividades apropiadas para su edad. No recomiendes pantallas como actividad principal. Sin texto fuera del JSON. Sin sermones.`;

const WEEKLY_SYSTEM = `Analiza los últimos 7 días de una niña pequeña. Devuelve SOLO JSON:
{"changes":[],"patterns":[],"new_likes":[],"new_dislikes":[],"repeat_activities":[],"repeat_foods":[],"watch":[],"recommendations":[]}.
No hagas diagnóstico médico. Si algo parece médico o preocupante, incluye en "watch" el texto "considerar consultar con pediatra". Sin texto fuera del JSON.`;

async function monthSpend(sb: any, userId: string): Promise<number> {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data } = await sb.from("ai_usage_logs").select("estimated_cost").eq("user_id", userId).gte("created_at", start.toISOString());
  return (data ?? []).reduce((s: number, r: any) => s + (Number(r.estimated_cost) || 0), 0);
}

async function callOpenAI(model: string, system: string, user: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
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

    // Tope de gasto mensual
    const spent = await monthSpend(sb, userId);
    if (spent >= MONTHLY_LIMIT) return json({ error: "Límite mensual alcanzado", blocked: true, month_spend: spent }, 402);

    const { action, payload } = await req.json();
    let model = MODEL_ANALYZE, system = ANALYZE_SYSTEM, userMsg = "";

    if (action === "analyze") { model = MODEL_ANALYZE; system = ANALYZE_SYSTEM; userMsg = `Fecha: ${payload.date}\nObservación: ${payload.text}`; }
    else if (action === "recommend") { model = MODEL_RECOMMEND; system = RECOMMEND_SYSTEM; userMsg = `Contexto: ${JSON.stringify(payload.context)}\nPerfil de Emma: ${JSON.stringify(payload.profile)}`; }
    else if (action === "weekly") { model = MODEL_WEEKLY; system = WEEKLY_SYSTEM; userMsg = `Perfil: ${JSON.stringify(payload.profile)}\nÚltimos días: ${JSON.stringify(payload.recent)}\nNotas importantes: ${JSON.stringify(payload.important_notes)}`; }
    else return json({ error: "Acción no válida" }, 400);

    const { content, usage } = await callOpenAI(model, system, userMsg);
    let parsed: any; try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const inTok = usage.prompt_tokens || 0, outTok = usage.completion_tokens || 0;
    const cost = (inTok / 1000) * PRICE_IN + (outTok / 1000) * PRICE_OUT;

    // Log de uso
    await sb.from("ai_usage_logs").insert({ user_id: userId, feature: action, model, input_tokens: inTok, output_tokens: outTok, estimated_cost: cost });

    // Guardar análisis de entrada
    if (action === "analyze" && payload.id) {
      await sb.from("emma_entry_analysis").upsert({
        user_id: userId, entry_id: payload.id, analysis_json: parsed, model_used: model,
        input_tokens: inTok, output_tokens: outTok, estimated_cost: cost,
      }, { onConflict: "entry_id" });
    }

    const newSpend = spent + cost;
    if (action === "analyze") return json({ analysis: parsed, model, input_tokens: inTok, output_tokens: outTok, estimated_cost: cost, month_spend: newSpend });
    if (action === "recommend") return json({ recommendations: Array.isArray(parsed) ? parsed : (parsed.recommendations || parsed.items || []), month_spend: newSpend });
    return json({ weekly: parsed, month_spend: newSpend });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
