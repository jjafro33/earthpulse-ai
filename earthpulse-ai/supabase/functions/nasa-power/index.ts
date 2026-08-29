// supabase/functions/nasa-power/index.ts
// EarthPulse AI — Secure proxy to NASA POWER API.
// Keeps any NASA API key server-side (NASA POWER itself does not
// require a key for the public daily-point endpoint, but this
// function still centralizes validation, caching, and CORS).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POWER_PARAMS = "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN";
const POWER_BASE = "https://power.larc.nasa.gov/api/temporal/daily/point";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { latitude, longitude, startDate, endDate } = await req.json();

    if (
      typeof latitude !== "number" || typeof longitude !== "number" ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      !startDate || !endDate
    ) {
      return json({ error: "Invalid latitude, longitude, startDate, or endDate." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cacheKey = `power:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${startDate}:${endDate}`;

    // 1. Check cache (api_cache table), valid for 24h
    const { data: cached } = await supabase
      .from("api_cache")
      .select("payload, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached && isFresh(cached.created_at, 24)) {
      return json(cached.payload);
    }

    // 2. Fetch live from NASA POWER
    const start = startDate.replaceAll("-", "");
    const end = endDate.replaceAll("-", "");
    const url = `${POWER_BASE}?parameters=${POWER_PARAMS}&community=RE&longitude=${longitude}&latitude=${latitude}&start=${start}&end=${end}&format=JSON`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`NASA POWER responded ${res.status}`);
    const raw = await res.json();

    const params = raw?.properties?.parameter;
    if (!params) throw new Error("Unexpected NASA POWER response shape");

    const dates = Object.keys(params.T2M || {});
    const daily = dates.map((d) => ({
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      T2M: safeNum(params.T2M?.[d]),
      PRECTOTCORR: safeNum(params.PRECTOTCORR?.[d]),
      ALLSKY_SFC_SW_DWN: safeNum(params.ALLSKY_SFC_SW_DWN?.[d]),
    }));

    const avg = (key: "T2M" | "PRECTOTCORR" | "ALLSKY_SFC_SW_DWN") =>
      round(daily.reduce((s, d) => s + d[key], 0) / daily.length, 2);

    const payload = {
      source: "NASA_POWER_LIVE",
      demo: false,
      latitude, longitude, startDate, endDate,
      daily,
      summary: {
        avgTempC: avg("T2M"),
        totalPrecipMm: round(daily.reduce((s, d) => s + d.PRECTOTCORR, 0), 1),
        avgSolarKwhM2: avg("ALLSKY_SFC_SW_DWN"),
      },
    };

    // 3. Write-through cache
    await supabase.from("api_cache").upsert({
      cache_key: cacheKey,
      endpoint: "nasa-power",
      payload,
      created_at: new Date().toISOString(),
    });

    return json(payload);
  } catch (err) {
    console.error("[nasa-power] error:", err);
    return json({ error: String(err?.message ?? err), source: "ERROR" }, 500);
  }
});

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
function isFresh(createdAt: string, hours: number) {
  return Date.now() - new Date(createdAt).getTime() < hours * 3600 * 1000;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
