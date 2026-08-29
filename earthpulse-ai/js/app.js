/* =========================================================
   EarthPulse AI — App controller
   Wires together supabase.js, nasa.js, map.js, charts.js, ai.js
   for whichever page is currently loaded.
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  EarthPulseDB.init();
  initNav();

  if (document.getElementById("map") && document.getElementById("metricGrid")) {
    initDashboard();
  }
  if (document.getElementById("compareApp")) {
    initCompare();
  }
});

/* ---------------------------------------------------------
   Shared: mobile nav toggle
--------------------------------------------------------- */
function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;
  toggle.addEventListener("click", () => {
    const open = links.style.display === "flex";
    links.style.display = open ? "none" : "flex";
    links.style.flexDirection = "column";
    links.style.position = "absolute";
    links.style.top = "64px";
    links.style.right = "20px";
    links.style.background = "#0d1424";
    links.style.border = "1px solid rgba(255,255,255,0.09)";
    links.style.borderRadius = "10px";
    links.style.padding = "14px 20px";
    links.style.gap = "14px";
  });
}

/* ---------------------------------------------------------
   Geocoding (OpenStreetMap Nominatim — public, no key needed)
--------------------------------------------------------- */
async function geocodeSearch(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    return data.map((d) => ({
      label: d.display_name,
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
    }));
  } catch (e) {
    console.warn("[EarthPulse] geocode error", e);
    return [];
  }
}

async function reverseLabel(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("reverse failed");
    const data = await res.json();
    return data.display_name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  } catch {
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  }
}

/* ---------------------------------------------------------
   DASHBOARD
--------------------------------------------------------- */
function initDashboard() {
  const state = {
    lat: 12.9716,
    lon: 77.5946,
    label: "Bengaluru, India",
    startDate: defaultStart(),
    endDate: defaultEnd(),
    power: null,
    fire: null,
    insight: null,
  };

  const els = {
    searchInput: document.getElementById("searchInput"),
    searchResults: document.getElementById("searchResults"),
    latInput: document.getElementById("latInput"),
    lonInput: document.getElementById("lonInput"),
    goCoords: document.getElementById("goCoords"),
    locName: document.getElementById("locName"),
    locCoords: document.getElementById("locCoords"),
    startDate: document.getElementById("startDate"),
    endDate: document.getElementById("endDate"),
    applyRange: document.getElementById("applyRange"),
    metricGrid: document.getElementById("metricGrid"),
    tempValue: document.getElementById("tempValue"),
    tempDelta: document.getElementById("tempDelta"),
    precipValue: document.getElementById("precipValue"),
    precipDelta: document.getElementById("precipDelta"),
    solarValue: document.getElementById("solarValue"),
    solarDelta: document.getElementById("solarDelta"),
    fireValue: document.getElementById("fireValue"),
    fireDelta: document.getElementById("fireDelta"),
    fireList: document.getElementById("fireList"),
    demoBanner: document.getElementById("demoBanner"),
    modeBadge: document.getElementById("modeBadge"),
    insightBody: document.getElementById("insightBody"),
    insightEmpty: document.getElementById("insightEmpty"),
    insightLoading: document.getElementById("insightLoading"),
    confidenceFill: document.getElementById("confidenceFill"),
    confidenceLabel: document.getElementById("confidenceLabel"),
    getInsightBtn: document.getElementById("getInsightBtn"),
    evidenceList: document.getElementById("evidenceList"),
    evidenceLabel: document.getElementById("evidenceLabel"),
    confidenceMeter: document.getElementById("confidenceMeter"),
    modalOverlay: document.getElementById("evidenceModal"),
    modalClose: document.getElementById("modalClose"),
    modalBody: document.getElementById("modalBody"),
    savedList: document.getElementById("savedList"),
    saveLocationBtn: document.getElementById("saveLocationBtn"),
    authStatus: document.getElementById("authStatus"),
    authAction: document.getElementById("authAction"),
  };

  els.startDate.value = state.startDate;
  els.endDate.value = state.endDate;

  EarthPulseMap.init("map", { lat: state.lat, lon: state.lon, zoom: 5 });
  EarthPulseMap.onSelect(async (lat, lon) => {
    state.lat = lat;
    state.lon = lon;
    state.label = await reverseLabel(lat, lon);
    syncLocationUI();
    await refreshAll();
  });

  // --- Search ---
  let searchDebounce;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const q = els.searchInput.value;
    searchDebounce = setTimeout(async () => {
      const results = await geocodeSearch(q);
      renderSearchResults(results);
    }, 350);
  });

  function renderSearchResults(results) {
    els.searchResults.innerHTML = "";
    results.forEach((r) => {
      const div = document.createElement("div");
      div.className = "search-result-item";
      div.textContent = r.label;
      div.addEventListener("click", async () => {
        state.lat = r.lat;
        state.lon = r.lon;
        state.label = r.label;
        els.searchResults.innerHTML = "";
        els.searchInput.value = "";
        EarthPulseMap.flyTo(r.lat, r.lon);
        syncLocationUI();
        await refreshAll();
      });
      els.searchResults.appendChild(div);
    });
  }

  // --- Manual coords ---
  els.goCoords.addEventListener("click", async () => {
    const lat = parseFloat(els.latInput.value);
    const lon = parseFloat(els.lonInput.value);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      alert("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }
    state.lat = lat;
    state.lon = lon;
    state.label = await reverseLabel(lat, lon);
    EarthPulseMap.flyTo(lat, lon);
    syncLocationUI();
    await refreshAll();
  });

  // --- Date range ---
  els.applyRange.addEventListener("click", async () => {
    state.startDate = els.startDate.value || state.startDate;
    state.endDate = els.endDate.value || state.endDate;
    await refreshAll();
  });

  function syncLocationUI() {
    els.locName.textContent = state.label;
    els.locCoords.textContent = `LAT ${state.lat.toFixed(4)} · LON ${state.lon.toFixed(4)}`;
    els.latInput.value = state.lat.toFixed(4);
    els.lonInput.value = state.lon.toFixed(4);
  }
  syncLocationUI();

  // --- Fetch + render ---
  async function refreshAll() {
    setLoadingCards(true);
    resetInsight();
    const [power, fire] = await Promise.all([
      EarthPulseNASA.getPowerData(state.lat, state.lon, state.startDate, state.endDate),
      EarthPulseNASA.getFireData(state.lat, state.lon, 150),
    ]);
    state.power = power;
    state.fire = fire;
    renderMetrics(power, fire);
    renderCharts(power);
    renderFireList(fire);
    EarthPulseMap.addFireMarkers(fire.events || []);
    updateDemoBanner(power.demo || fire.demo);
    setLoadingCards(false);
  }

  function setLoadingCards(loading) {
    els.metricGrid.style.opacity = loading ? 0.5 : 1;
  }

  function updateDemoBanner(isDemo) {
    els.demoBanner.classList.toggle("show", !!isDemo);
    els.modeBadge.textContent = isDemo ? "DEMO MODE" : "LIVE NASA DATA";
    els.modeBadge.classList.toggle("demo", !!isDemo);
  }

  function pctDelta(seriesKey, data) {
    if (!data.daily || data.daily.length < 4) return null;
    const mid = Math.floor(data.daily.length / 2);
    const firstHalf = data.daily.slice(0, mid);
    const secondHalf = data.daily.slice(mid);
    const avg = (arr) => arr.reduce((s, d) => s + d[seriesKey], 0) / arr.length;
    const a = avg(firstHalf), b = avg(secondHalf);
    if (a === 0) return null;
    return +(((b - a) / Math.abs(a)) * 100).toFixed(1);
  }

  function deltaBadge(el, value, { invert = false } = {}) {
    if (value === null || Number.isNaN(value)) {
      el.textContent = "—";
      el.className = "metric-delta flat";
      return;
    }
    const up = invert ? value < 0 : value > 0;
    const flat = Math.abs(value) < 0.5;
    el.textContent = `${value > 0 ? "▲" : value < 0 ? "▼" : "→"} ${Math.abs(value)}% vs first half`;
    el.className = `metric-delta ${flat ? "flat" : up ? "up" : "down"}`;
  }

  function renderMetrics(power, fire) {
    els.tempValue.innerHTML = `${power.summary.avgTempC}<span class="unit">°C</span>`;
    els.precipValue.innerHTML = `${power.summary.totalPrecipMm}<span class="unit">mm</span>`;
    els.solarValue.innerHTML = `${power.summary.avgSolarKwhM2}<span class="unit">kWh/m²</span>`;
    els.fireValue.innerHTML = `${fire.count}<span class="unit">detections</span>`;

    deltaBadge(els.tempDelta, pctDelta("T2M", power));
    deltaBadge(els.precipDelta, pctDelta("PRECTOTCORR", power));
    deltaBadge(els.solarDelta, pctDelta("ALLSKY_SFC_SW_DWN", power));
    els.fireDelta.textContent = fire.radiusKm ? `within ${fire.radiusKm} km radius` : "";
    els.fireDelta.className = "metric-delta flat";
  }

  function renderCharts(power) {
    const labels = power.daily.map((d) => d.date.slice(5));
    EarthPulseCharts.lineChart("tempChart", labels, [
      { label: "Temp (°C)", data: power.daily.map((d) => d.T2M), color: "#ff6b6b" },
    ]);
    EarthPulseCharts.barChart("precipChart", labels, [
      { label: "Precip (mm)", data: power.daily.map((d) => d.PRECTOTCORR), color: "#5ce1e6" },
    ]);
    EarthPulseCharts.lineChart("solarChart", labels, [
      { label: "Solar (kWh/m²)", data: power.daily.map((d) => d.ALLSKY_SFC_SW_DWN), color: "#ffb454", fill: true },
    ]);
  }

  function renderFireList(fire) {
    els.fireList.innerHTML = "";
    if (!fire.events || fire.events.length === 0) {
      els.fireList.innerHTML = `<div class="empty-hint">No active fire detections in this radius.</div>`;
      return;
    }
    fire.events.forEach((ev) => {
      const div = document.createElement("div");
      div.className = "fire-item";
      div.innerHTML = `
        <span>${ev.satellite} · ${new Date(ev.detectedAt).toLocaleString()}</span>
        <span class="conf ${ev.confidence}">${ev.confidence}</span>
      `;
      els.fireList.appendChild(div);
    });
  }

  // --- AI Insight ---
  function resetInsight() {
    state.insight = null;
    els.insightBody.style.display = "none";
    els.insightEmpty.style.display = "block";
    els.evidenceList.innerHTML = "";
  }

  els.getInsightBtn.addEventListener("click", async () => {
    if (!state.power) return;
    els.insightEmpty.style.display = "none";
    els.insightLoading.style.display = "flex";
    els.insightBody.style.display = "none";

    const insight = await EarthPulseAI.requestInsight({
      locationLabel: state.label,
      lat: state.lat,
      lon: state.lon,
      power: state.power,
      fire: state.fire,
    });
    state.insight = insight;
    renderInsight(insight);
  });

  function renderInsight(insight) {
    els.insightLoading.style.display = "none";
    els.insightBody.style.display = "block";
    els.confidenceMeter.style.display = "flex";
    els.evidenceLabel.style.display = "block";

    const pct = Math.round((insight.confidence ?? 0.5) * 100);
    els.confidenceFill.style.width = `${pct}%`;
    els.confidenceLabel.textContent = `${pct}% confidence`;

    let html = `<div>${escapeHtml(insight.explanation || "").replace(/\n/g, "<br><br>")}</div>`;

    if (insight.observations && insight.observations.length) {
      html += `<div class="insight-section-label">Observations</div><ul>` +
        insight.observations.map((o) => `<li>${escapeHtml(o)}</li>`).join("") + `</ul>`;
    }
    if (insight.possibleExplanations && insight.possibleExplanations.length) {
      html += `<div class="insight-section-label">Possible explanations (not confirmed)</div><ul>` +
        insight.possibleExplanations.map((o) => `<li>${escapeHtml(o)}</li>`).join("") + `</ul>`;
    }
    if (insight.demo) {
      html = `<div class="mode-badge demo" style="margin-bottom:12px;"><span class="dot"></span> DEMO DATA — connect NASA APIs for live observations.</div>` + html;
    }

    els.insightBody.innerHTML = html;

    // Evidence chips
    els.evidenceList.innerHTML = "";
    const chips = [
      { label: "Temperature chart", target: "tempChart" },
      { label: "Precipitation chart", target: "precipChart" },
      { label: "Solar radiation chart", target: "solarChart" },
    ];
    chips.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "evidence-chip";
      btn.textContent = `View Evidence · ${c.label}`;
      btn.addEventListener("click", () => openEvidenceModal(c.target, insight));
      els.evidenceList.appendChild(btn);
    });
  }

  function openEvidenceModal(target, insight) {
    const m = insight.metrics?.climate || state.power.summary;
    els.modalBody.innerHTML = `
      <div class="evidence-metric-row"><span class="k">Metric source</span><span class="v">NASA POWER</span></div>
      <div class="evidence-metric-row"><span class="k">Avg Temperature</span><span class="v">${m.avgTempC} °C</span></div>
      <div class="evidence-metric-row"><span class="k">Total Precipitation</span><span class="v">${m.totalPrecipMm} mm</span></div>
      <div class="evidence-metric-row"><span class="k">Avg Solar Radiation</span><span class="v">${m.avgSolarKwhM2} kWh/m²</span></div>
      <div class="evidence-metric-row"><span class="k">Date range</span><span class="v">${state.startDate} → ${state.endDate}</span></div>
      <div class="evidence-metric-row"><span class="k">Chart referenced</span><span class="v">${target}</span></div>
    `;
    els.modalOverlay.classList.add("open");
  }
  els.modalClose.addEventListener("click", () => els.modalOverlay.classList.remove("open"));
  els.modalOverlay.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) els.modalOverlay.classList.remove("open");
  });

  // --- Auth + saved locations ---
  async function refreshAuthUI() {
    const user = await EarthPulseDB.getUser();
    if (!EarthPulseDB.isConfigured()) {
      els.authStatus.innerHTML = `Supabase not configured — running in local demo mode.`;
      els.authAction.style.display = "none";
    } else if (user) {
      els.authStatus.innerHTML = `Signed in as <strong>${user.email}</strong>`;
      els.authAction.textContent = "Sign out";
      els.authAction.style.display = "inline-flex";
      els.authAction.onclick = async () => { await EarthPulseDB.signOut(); refreshAuthUI(); refreshSavedList(); };
    } else {
      els.authStatus.innerHTML = `Not signed in`;
      els.authAction.textContent = "Sign in";
      els.authAction.style.display = "inline-flex";
      els.authAction.onclick = handleSignIn;
    }
  }

  async function handleSignIn() {
    const email = prompt("Email for magic-link-free demo sign in (email + password):");
    if (!email) return;
    const password = prompt("Password (min 6 chars):");
    if (!password) return;
    try {
      let { error } = await EarthPulseDB.signInWithEmail(email, password);
      if (error) {
        const signUp = await EarthPulseDB.signUpWithEmail(email, password);
        if (signUp.error) throw signUp.error;
      }
      refreshAuthUI();
      refreshSavedList();
    } catch (e) {
      alert("Auth error: " + e.message);
    }
  }

  async function refreshSavedList() {
    const items = await EarthPulseDB.listSavedLocations();
    els.savedList.innerHTML = "";
    if (!items.length) {
      els.savedList.innerHTML = `<div class="empty-hint">No saved locations yet.</div>`;
      return;
    }
    items.forEach((loc) => {
      const div = document.createElement("div");
      div.className = "saved-item";
      div.innerHTML = `<span>${loc.label}</span>`;
      const del = document.createElement("button");
      del.textContent = "✕";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        await EarthPulseDB.deleteSavedLocation(loc.id);
        refreshSavedList();
      });
      div.appendChild(del);
      div.addEventListener("click", async () => {
        state.lat = loc.latitude;
        state.lon = loc.longitude;
        state.label = loc.label;
        EarthPulseMap.flyTo(loc.latitude, loc.longitude);
        syncLocationUI();
        await refreshAll();
      });
      els.savedList.appendChild(div);
    });
  }

  els.saveLocationBtn.addEventListener("click", async () => {
    try {
      await EarthPulseDB.saveLocation(state.label, state.lat, state.lon);
      refreshSavedList();
    } catch (e) {
      alert(e.message || "Sign in to save locations.");
    }
  });

  refreshAuthUI();
  refreshSavedList();
  EarthPulseMap.invalidateSize();
  refreshAll();
}

/* ---------------------------------------------------------
   COMPARE / EARTH TIME MACHINE
--------------------------------------------------------- */
function initCompare() {
  const els = {
    searchInput: document.getElementById("cmpSearchInput"),
    searchResults: document.getElementById("cmpSearchResults"),
    locLabel: document.getElementById("cmpLocLabel"),
    aStart: document.getElementById("aStart"),
    aEnd: document.getElementById("aEnd"),
    bStart: document.getElementById("bStart"),
    bEnd: document.getElementById("bEnd"),
    runBtn: document.getElementById("runCompare"),
    tableBody: document.getElementById("compareTableBody"),
    chartWrap: document.getElementById("compareChartWrap"),
    demoBanner: document.getElementById("cmpDemoBanner"),
    modeBadge: document.getElementById("cmpModeBadge"),
  };

  const state = { lat: 12.9716, lon: 77.5946, label: "Bengaluru, India" };
  els.locLabel.textContent = state.label;

  const today = new Date();
  const lastYear = new Date(today); lastYear.setFullYear(today.getFullYear() - 1);
  const lastYearEnd = new Date(lastYear); lastYearEnd.setDate(lastYearEnd.getDate() + 30);
  const thisRangeStart = new Date(today); thisRangeStart.setDate(today.getDate() - 30);

  els.aStart.value = toISO(lastYear);
  els.aEnd.value = toISO(lastYearEnd);
  els.bStart.value = toISO(thisRangeStart);
  els.bEnd.value = toISO(today);

  let searchDebounce;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      const results = await geocodeSearch(els.searchInput.value);
      els.searchResults.innerHTML = "";
      results.forEach((r) => {
        const div = document.createElement("div");
        div.className = "search-result-item";
        div.textContent = r.label;
        div.addEventListener("click", () => {
          state.lat = r.lat; state.lon = r.lon; state.label = r.label;
          els.locLabel.textContent = r.label;
          els.searchResults.innerHTML = "";
          els.searchInput.value = "";
        });
        els.searchResults.appendChild(div);
      });
    }, 350);
  });

  els.runBtn.addEventListener("click", async () => {
    els.runBtn.disabled = true;
    els.runBtn.textContent = "Comparing…";
    const rangeA = { start: els.aStart.value, end: els.aEnd.value };
    const rangeB = { start: els.bStart.value, end: els.bEnd.value };
    const comparison = await EarthPulseNASA.getComparison(state.lat, state.lon, rangeA, rangeB);
    renderComparison(comparison);
    els.runBtn.disabled = false;
    els.runBtn.textContent = "Compare Ranges →";
  });

  function renderComparison(cmp) {
    els.demoBanner.classList.toggle("show", !!cmp.demo);
    els.modeBadge.textContent = cmp.demo ? "DEMO MODE" : "LIVE NASA DATA";
    els.modeBadge.classList.toggle("demo", !!cmp.demo);

    const rows = [
      ["Avg Temperature (°C)", cmp.rangeA.summary.avgTempC, cmp.rangeB.summary.avgTempC, cmp.changes.avgTempC],
      ["Total Precipitation (mm)", cmp.rangeA.summary.totalPrecipMm, cmp.rangeB.summary.totalPrecipMm, cmp.changes.totalPrecipMm],
      ["Avg Solar Radiation (kWh/m²)", cmp.rangeA.summary.avgSolarKwhM2, cmp.rangeB.summary.avgSolarKwhM2, cmp.changes.avgSolarKwhM2],
    ];
    els.tableBody.innerHTML = rows.map(([label, a, b, change]) => {
      const cls = Math.abs(change) < 1 ? "flat" : change > 0 ? "up" : "down";
      const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "→";
      return `<tr>
        <td>${label}</td>
        <td class="num">${a}</td>
        <td class="num">${b}</td>
        <td><span class="change-pill ${cls}">${arrow} ${Math.abs(change)}%</span></td>
      </tr>`;
    }).join("");

    EarthPulseCharts.barChart("compareChart",
      ["Temp % Δ", "Precip % Δ", "Solar % Δ"],
      [{ label: "% change", data: [cmp.changes.avgTempC, cmp.changes.totalPrecipMm, cmp.changes.avgSolarKwhM2], color: "#5ce1e6" }]
    );
  }

  // Initial run
  els.runBtn.click();
}

/* ---------------------------------------------------------
   Utils
--------------------------------------------------------- */
function defaultEnd() {
  return toISO(new Date());
}
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toISO(d);
}
function toISO(d) {
  return d.toISOString().slice(0, 10);
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
