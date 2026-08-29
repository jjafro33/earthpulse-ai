/* =========================================================
   EarthPulse AI — Chart.js chart builders
   ========================================================= */

const EarthPulseCharts = (() => {
  const registry = {};

  Chart.defaults.color = "#93a1b5";
  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.font.size = 11;

  const gridOpts = { color: "rgba(255,255,255,0.06)" };

  function destroy(id) {
    if (registry[id]) {
      registry[id].destroy();
      delete registry[id];
    }
  }

  function lineChart(canvasId, labels, datasets) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext("2d");
    registry[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: d.color + "22",
          fill: !!d.fill,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: datasets.length > 1, labels: { boxWidth: 10, padding: 14 } },
          tooltip: {
            backgroundColor: "#0d1424",
            borderColor: "rgba(255,255,255,0.12)",
            borderWidth: 1,
            titleColor: "#eef3f8",
            bodyColor: "#93a1b5",
            padding: 10,
          },
        },
        scales: {
          x: { grid: gridOpts, ticks: { maxTicksLimit: 8 } },
          y: { grid: gridOpts },
        },
      },
    });
    return registry[canvasId];
  }

  function barChart(canvasId, labels, datasets) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext("2d");
    registry[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          backgroundColor: d.color,
          borderRadius: 4,
          maxBarThickness: 26,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length > 1, labels: { boxWidth: 10, padding: 14 } },
          tooltip: {
            backgroundColor: "#0d1424",
            borderColor: "rgba(255,255,255,0.12)",
            borderWidth: 1,
            titleColor: "#eef3f8",
            bodyColor: "#93a1b5",
            padding: 10,
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: gridOpts },
        },
      },
    });
    return registry[canvasId];
  }

  return { lineChart, barChart, destroy };
})();
