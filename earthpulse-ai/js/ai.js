/* =========================================================
   EarthPulse AI — AI Earth Insight module
   Sends only validated, already-calculated metrics to the
   earth-analysis Edge Function. Never sends raw satellite
   payloads or lets the AI touch anything not shown on screen.
   ========================================================= */

const EarthPulseAI = (() => {
  async function requestInsight({ locationLabel, lat, lon, power, fire, comparison }) {
    // Build a strict, validated payload — this is ALL the AI ever sees.
    const metrics = {
      location: { label: locationLabel, latitude: +lat.toFixed(4), longitude: +lon.toFixed(4) },
      climate: power?.summary ?? null,
      fireActivity: fire ? { count: fire.count, radiusKm: fire.radiusKm } : null,
      comparison: comparison
        ? {
            rangeA: `${comparison.rangeA.start} to ${comparison.rangeA.end}`,
            rangeB: `${comparison.rangeB.start} to ${comparison.rangeB.end}`,
            percentChange: comparison.changes,
          }
        : null,
      dataSources: ["NASA POWER"].concat(fire ? ["NASA FIRMS"] : []),
    };

    const result = await EarthPulseDB.invokeFunction("earth-analysis", { metrics });

    if (result && result.source === "AI_LIVE") {
      return { ...result, demo: false, metrics };
    }

    // DEMO MODE fallback — deterministic, template-based "insight" built
    // ONLY from the same validated metrics, clearly labelled as non-AI-generated.
    return buildDemoInsight(metrics);
  }

  function buildDemoInsight(metrics) {
    const c = metrics.climate;
    const lines = [];
    lines.push(`DEMO INSIGHT (no AI key configured) for ${metrics.location.label}.`);
    if (c) {
      lines.push(
        `Observed average temperature was ${c.avgTempC}\u00b0C with total precipitation of ${c.totalPrecipMm} mm and average solar radiation of ${c.avgSolarKwhM2} kWh/m\u00b2/day over the selected period.`
      );
    }
    if (metrics.comparison) {
      const ch = metrics.comparison.percentChange;
      lines.push(
        `Comparing the two selected ranges, temperature changed ${ch.avgTempC}%, precipitation changed ${ch.totalPrecipMm}%, and solar radiation changed ${ch.avgSolarKwhM2}%.`
      );
    }
    if (metrics.fireActivity) {
      lines.push(`${metrics.fireActivity.count} fire detection(s) were recorded within ${metrics.fireActivity.radiusKm} km.`);
    }
    lines.push("This is template text generated from the metrics above, not a live AI response.");

    return {
      demo: true,
      source: "DEMO_DATA",
      confidence: 0.4,
      explanation: lines.join("\n\n"),
      observations: c ? [`Avg temp ${c.avgTempC}\u00b0C`, `Total precip ${c.totalPrecipMm} mm`, `Avg solar ${c.avgSolarKwhM2} kWh/m\u00b2`] : [],
      possibleExplanations: ["Seasonal variation", "Regional climate patterns", "Local geography and elevation"],
      metrics,
    };
  }

  return { requestInsight };
})();
