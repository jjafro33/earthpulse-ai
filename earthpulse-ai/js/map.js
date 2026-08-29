/* =========================================================
   EarthPulse AI — Leaflet map controller
   ========================================================= */

const EarthPulseMap = (() => {
  let map = null;
  let marker = null;
  let onSelectCallback = null;

  function init(elementId, { lat = 12.9716, lon = 77.5946, zoom = 5 } = {}) {
    map = L.map(elementId, {
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lon], zoom);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors',
      maxZoom: 18,
      subdomains: "abcd",
    }).addTo(map);

    marker = L.circleMarker([lat, lon], {
      radius: 8,
      color: "#5ce1e6",
      weight: 2,
      fillColor: "#5ce1e6",
      fillOpacity: 0.35,
    }).addTo(map);

    map.on("click", (e) => {
      setMarker(e.latlng.lat, e.latlng.lng);
      if (onSelectCallback) onSelectCallback(e.latlng.lat, e.latlng.lng);
    });

    return map;
  }

  function setMarker(lat, lon, { pan = false } = {}) {
    if (!map) return;
    marker.setLatLng([lat, lon]);
    if (pan) map.panTo([lat, lon]);
  }

  function flyTo(lat, lon, zoom = 7) {
    if (!map) return;
    setMarker(lat, lon);
    map.flyTo([lat, lon], zoom, { duration: 1.1 });
  }

  function addFireMarkers(events = []) {
    if (!map) return;
    if (window.__firePins) {
      window.__firePins.forEach((p) => map.removeLayer(p));
    }
    window.__firePins = events.map((ev) => {
      const color = ev.confidence === "high" ? "#ff6b6b" : ev.confidence === "nominal" ? "#ffb454" : "#93a1b5";
      return L.circleMarker([ev.latitude, ev.longitude], {
        radius: 5,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.7,
      })
        .bindTooltip(`${ev.satellite} · ${ev.confidence} confidence`)
        .addTo(map);
    });
  }

  function onSelect(cb) {
    onSelectCallback = cb;
  }

  function invalidateSize() {
    if (map) setTimeout(() => map.invalidateSize(), 150);
  }

  return { init, setMarker, flyTo, addFireMarkers, onSelect, invalidateSize };
})();
