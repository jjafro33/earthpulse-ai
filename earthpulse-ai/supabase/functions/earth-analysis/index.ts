// supabase/functions/earth-analysis/index.ts
// EarthPulse AI — AI Earth Insight generator.
// Receives ONLY already-validated, already-calculated metrics from
// the client (never raw satellite payloads). Sends a tightly-scoped
// prompt to the AI provider and returns structured, evidence-linked
// JSON. The AI secret key lives only in this function's environment.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are EarthPulse AI's Earth Insight engine.
You will be given a JSON object called "metrics" containing ONLY validated,
already-calculated NASA-derived observations (never raw satellite files).

Rules you MUST follow:
1. Only reference numbers that appear in "metrics". Never invent a NASA
   measurement, station, or figure that was not supplied.
2. Clearly separate OBSERVATIONS (what the numbers show) from POSSIBLE
   EXPLANATIONS (plausible reasons, explicitly labeled as not confirmed).
3. Explain trends in plain, non-technical language a general audience
   can follow.
4. Cite the specific metric values you reference (e.g. "average
   temperature of 27.4°C").
5. Return a confidence value between 0 and 1 reflecting how much the
   supplied data actually supports your explanation (short date ranges
   or missing fields should lower confidence).
6. Respond ONLY as strict JSON with this exact shape, no markdown fences,
   no prose outside the JSON:
{
  "explanation": string,
  "observations": string[],
  "possibleExplanations": string[],
  "confidence": number
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { metrics } = await req.json();
    if (!metrics || typeof metrics !== "object") {
      return json({ error: "Missing or invalid 'metrics' payload." }, 400);
    }

    // Strip anything not explicitly allow-listed, defense in depth —
    // never forward arbitrary client fields into the AI prompt.
    const safeMetrics = {
      location: pick(metrics.location, ["label", "latitude", "longitude"]),
      climate: metrics.climate
        ? pick(metrics.climate, ["avgTempC", "totalPrecipMm", "avgSolarKwhM2"])
        : null,
      fireActivity: metrics.fireActivity
        ? pick(metrics.fireActivity, ["count", "radiusKm"])
        : null,
      comparison: metrics.comparison
        ? pick(metrics.comparison, ["rangeA", "rangeB", "percentChange"])
        : null,
      dataSources: Array.isArray(metrics.dataSources) ? metrics.dataSources : [],
    };

    const aiKey = Deno.env.get("AI_API_KEY");
    if (!aiKey) {
      return json({ error: "AI_API_KEY not configured", source: "NOT_CONFIGURED" }, 200);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": aiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `metrics = ${JSON.stringify(safeMetrics)}` },
        ],
      }),
    });

    if (!aiRes.ok) throw new Error(`AI provider responded ${aiRes.status}`);
    const aiData = await aiRes.json();
    const textBlock = (aiData.content || []).find((c: any) => c.type === "text");
    if (!textBlock) throw new Error("AI response had no text content");

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text.trim());
    } catch {
      throw new Error("AI response was not valid JSON");
    }

    const payload = {
      source: "AI_LIVE",
      demo: false,
      explanation: String(parsed.explanation ?? ""),
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      possibleExplanations: Array.isArray(parsed.possibleExplanations) ? parsed.possibleExplanations : [],
      confidence: clamp01(Number(parsed.confidence ?? 0.5)),
    };

    // Persist for the analysis_results table (evidence trail).
    await supabase.from("analysis_results").insert({
      location_label: safeMetrics.location?.label ?? null,
      latitude: safeMetrics.location?.latitude ?? null,
      longitude: safeMetrics.location?.longitude ?? null,
      input_metrics: safeMetrics,
      explanation: payload.explanation,
      observations: payload.observations,
      possible_explanations: payload.possibleExplanations,
      confidence: payload.confidence,
      created_at: new Date().toISOString(),
    });

    return json(payload);
  } catch (err) {
    console.error("[earth-analysis] error:", err);
    return json({ error: String(err?.message ?? err), source: "ERROR" }, 500);
  }
});

function pick(obj: any, keys: string[]) {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}
function clamp01(n: number) {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
