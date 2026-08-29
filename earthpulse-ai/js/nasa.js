/* =========================================================
   EarthPulse AI — NASA data access layer
   Calls Supabase Edge Functions (nasa-power / nasa-firms).
   Falls back to clearly-labelled DEMO MODE data when the
   Edge Functions / Supabase are not configured or fail.
   ========================================================= */

const EarthPulseNASA = (() => {
  let demoModeActive = false;

  function isDemoMode() {
    return demoModeActive;
  }

  // ---- Seeded pseudo-random so demo numbers are stable per location ----
  function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function dateRangeDays(startDate, endDate) {
    const d1 = new Date(startDate), d2 = new Date(endDate);
    return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
  }

  function fmt(d) {
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  }

  // ---- POWER (climate) ----
  async function getPowerData(lat, lon, startDate, endDate) {
    const payload = { latitude: lat, longitude: lon, startDate, endDate };
    const result = await EarthPulseDB.invokeFunction("nasa-power", payload);
    if (result && result.source === "NASA_POWER_LIVE") {
      demoModeActive = demoModeActive || false;
      return result;
    }
    demoModeActive = true;
    return buildDemoPowerData(lat, lon, startDate, endDate);
  }

  function buildDemoPowerData(lat, lon, startDate, endDate) {
    const days = dateRangeDays(startDate, endDate);
    const seed = (lat * 13.37) + (lon * 7.77);
    const baseTemp = 28 - Math.abs(lat) * 0.45; // warmer near equator
    const series = [];
    const start = new Date(startDate);
    for (let i = 0; i < days; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const noise = seededRandom(seed + i) - 0.5;
      const seasonal = Math.sin((i / Math.max(days, 30)) * Math.PI * 2) * 3;
      series.push({
        date: day.toISOString().slice(0, 10),
        T2M: +(baseTemp + seasonal + noise * 4).toFixed(1),
        PRECTOTCORR: +Math.max(0, (seededRandom(seed + i + 100) * 12) - 4).toFixed(2),
        ALLSKY_SFC_SW_DWN: +(18 + seededRandom(seed + i + 200) * 8 - Math.abs(lat) * 0.08).toFixed(2),
      });
    }
    const avg = (key) => +(series.reduce((s, d) => s + d[key], 0) / series.length).toFixed(2);
    return {
      source: "DEMO_DATA",
      demo: true,
      latitude: lat,
      longitude: lon,
      startDate, endDate,
      daily: series,
      summary: {
        avgTempC: avg("T2M"),
        totalPrecipMm: +series.reduce((s, d) => s + d.PRECTOTCORR, 0).toFixed(1),
        avgSolarKwhM2: avg("ALLSKY_SFC_SW_DWN"),
      },
    };
  }

  // ---- FIRMS (fire activity) ----
  async function getFireData(lat, lon, radiusKm = 100) {
    const payload = { latitude: lat, longitude: lon, radiusKm };
    const result = await EarthPulseDB.invokeFunction("nasa-firms", payload);
    if (result && result.source === "NASA_FIRMS_LIVE") {
      return result;
    }
    demoModeActive = true;
    return buildDemoFireData(lat, lon, radiusKm);
  }

  function buildDemoFireData(lat, lon, radiusKm) {
    const seed = lat * 3.14 + lon * 1.618;
    const count = Math.floor(seededRandom(seed) * 6); // 0-5 demo hotspots
    const events = [];
    for (let i = 0; i < count; i++) {
      const jitterLat = (seededRandom(seed + i) - 0.5) * (radiusKm / 111);
      const jitterLon = (seededRandom(seed + i + 50) - 0.5) * (radiusKm / 111);
      const confidenceRoll = seededRandom(seed + i + 300);
      events.push({
        latitude: +(lat + jitterLat).toFixed(4),
        longitude: +(lon + jitterLon).toFixed(4),
        brightnessK: +(300 + seededRandom(seed + i + 400) * 60).toFixed(1),
        confidence: confidenceRoll > 0.7 ? "high" : confidenceRoll > 0.35 ? "nominal" : "low",
        detectedAt: new Date(Date.now() - i * 6 * 3600 * 1000).toISOString(),
        satellite: i % 2 === 0 ? "VIIRS" : "MODIS",
      });
    }
    return {
      source: "DEMO_DATA",
      demo: true,
      latitude: lat,
      longitude: lon,
      radiusKm,
      count: events.length,
      events,
    };
  }

  // ---- Historical comparison (Earth Time Machine) ----
  async function getComparison(lat, lon, rangeA, rangeB) {
    const [a, b] = await Promise.all([
      getPowerData(lat, lon, rangeA.start, rangeA.end),
      getPowerData(lat, lon, rangeB.start, rangeB.end),
    ]);
    const pctChange = (before, after) =>
      before === 0 ? 0 : +(((after - before) / Math.abs(before)) * 100).toFixed(1);

    return {
      demo: a.demo || b.demo,
      rangeA: { ...rangeA, summary: a.summary },
      rangeB: { ...rangeB, summary: b.summary },
      changes: {
        avgTempC: pctChange(a.summary.avgTempC, b.summary.avgTempC),
        totalPrecipMm: pctChange(a.summary.totalPrecipMm, b.summary.totalPrecipMm),
        avgSolarKwhM2: pctChange(a.summary.avgSolarKwhM2, b.summary.avgSolarKwhM2),
      },
    };
  }

  return { getPowerData, getFireData, getComparison, isDemoMode, fmt };
})();
