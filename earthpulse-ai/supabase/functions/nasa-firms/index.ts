// supabase/functions/nasa-firms/index.ts
// EarthPulse AI — Secure proxy to NASA FIRMS (Fire Information for
// Resource Management System). The FIRMS MAP_KEY is read from an
// Edge Function secret and NEVER sent to the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// FIRMS area API: CSV of active fire detections in a bounding box, last N days.
const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { latitude, longitude, radiusKm = 100 } = await req.json();

    if (
      typeof latitude !== "number" || typeof longitude !== "number" ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    ) {
      return json({ error: "Invalid latitude or longitude." }, 400);
    }

    const mapKey = Deno.env.get("FIRMS_MAP_KEY");
    if (!mapKey) {
      // No key configured server-side — let the client fall back to demo mode.
      return json({ error: "FIRMS_MAP_KEY not configured", source: "NOT_CONFIGURED" }, 200);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cacheKey = `firms:${latitude.toFixed(2)}:${longitude.toFixed(2)}:${radiusKm}`;
    const { data: cached } = await supabase
      .from("api_cache")
      .select("payload, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached && isFresh(cached.created_at, 1)) {
      return json(cached.payload);
    }

    // Bounding box approximation from radius (km) around the point.
    const degLat = radiusKm / 111;
    const degLon = radiusKm / (111 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));
    const bbox = [
      longitude - degLon, latitude - degLat,
      longitude + degLon, latitude + degLat,
    ].join(",");

    const url = `${FIRMS_BASE}/${mapKey}/VIIRS_SNPP_NRT/${bbox}/1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NASA FIRMS responded ${res.status}`);
    const csv = await res.text();

    const events = parseFirmsCsv(csv);

    const payload = {
      source: "NASA_FIRMS_LIVE",
      demo: false,
      latitude, longitude, radiusKm,
      count: events.length,
      events,
    };

    await supabase.from("api_cache").upsert({
      cache_key: cacheKey,
      endpoint: "nasa-firms",
      payload,
      created_at: new Date().toISOString(),
    });

    // Also persist normalized events for historical querying.
    if (events.length) {
      await supabase.from("fire_events").insert(
        events.map((e) => ({
          latitude: e.latitude,
          longitude: e.longitude,
          brightness_k: e.brightnessK,
          confidence: e.confidence,
          satellite: e.satellite,
          detected_at: e.detectedAt,
        }))
      );
    }

    return json(payload);
  } catch (err) {
    console.error("[nasa-firms] error:", err);
    return json({ error: String(err?.message ?? err), source: "ERROR" }, 500);
  }
});

function parseFirmsCsv(csv: string) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  const idx = (name: string) => headers.indexOf(name);

  const latI = idx("latitude"), lonI = idx("longitude"),
        brightI = idx("bright_ti4") >= 0 ? idx("bright_ti4") : idx("brightness"),
        confI = idx("confidence"), dateI = idx("acq_date"), timeI = idx("acq_time");

  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(",");
    const rawConf = (cols[confI] || "").toLowerCase();
    const confidence = rawConf === "h" || rawConf === "high" ? "high"
      : rawConf === "l" || rawConf === "low" ? "low"
      : "nominal";
    const time = (cols[timeI] || "0000").padStart(4, "0");
    return {
      latitude: Number(cols[latI]),
      longitude: Number(cols[lonI]),
      brightnessK: Number(cols[brightI]),
      confidence,
      satellite: "VIIRS",
      detectedAt: `${cols[dateI]}T${time.slice(0, 2)}:${time.slice(2)}:00Z`,
    };
  });
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
