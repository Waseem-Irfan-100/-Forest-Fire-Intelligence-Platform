(function () {

  /* ============================================================
   *  SHARED CONFIG — used by both Leaflet and MapLibre
   * ============================================================ */

  const INDIA_BOUNDS = [[6.5, 68.0], [37.5, 97.5]];     // [[south,west],[north,east]]
  const INDIA_CENTER_LL = [22.5, 79.0];                  // [lat, lon]  — Leaflet order
  const INDIA_CENTER_LNG_LAT = [79.0, 22.5];             // [lon, lat]  — MapLibre order
  const DEFAULT_ZOOM = 4.8;

  const data = window.LSI_FIRE_DATA;

  /* ---- colour helpers (shared) ---- */

  function frpColor(frp) {
    if (frp >= 1000) return "#ef4444";   // red    — extreme
    if (frp >= 500)  return "#f97316";   // orange — severe
    if (frp >= 200)  return "#eab308";   // amber  — high
    return "#60a5fa";                    // blue   — low
  }

  function fwiClass(fwi) {
    if (fwi >= 35) return { label: "Extreme",   cls: "risk-extreme"   };
    if (fwi >= 25) return { label: "Very High", cls: "risk-very-high" };
    if (fwi >= 15) return { label: "High",      cls: "risk-high"      };
    if (fwi >= 5)  return { label: "Moderate",  cls: "risk-moderate"  };
    return               { label: "Low",        cls: "risk-low"       };
  }

  /* ── Fetch fire data through Django backend (keeps API key hidden) ── */
  async function fetchFIRMSData() {
    try {
      const response = await fetch("/api/fires/");
      const payload = await response.json();
      if (!response.ok) {
        const msg = payload?.error || `HTTP ${response.status}`;
        console.error("FIRMS proxy error:", msg);
        return [];
      }
      if (payload && typeof payload === "object" && payload.error) {
        console.error("FIRMS proxy error:", payload.error);
        return [];
      }
      return Array.isArray(payload) ? payload : [];
    } catch (err) {
      console.error("FIRMS Fetch Failed:", err);
      return [];
    }
  }

  function popupHtml(f) {
    const risk = fwiClass(f.fwi);
    return `
      <div class="map-popup">
        <strong>${f.ecoregion}</strong>
        <div class="popup-grid">
          <span>FRP</span><b>${f.frp} MW</b>
          <span>FWI</span><b class="${risk.cls}">${(+f.fwi).toFixed(1)}</b>
          <span>DSR</span><b>${(+f.dsr).toFixed(1)}</b>
          <span>Source</span><b>${f.source}</b>
          <span>Date</span><b>${f.date}</b>
        </div>
        <span class="popup-badge ${risk.cls}">${risk.label} danger</span>
      </div>`;
  }


  /* ============================================================
   *  MAP ENGINE SWITCH
   *  To use Leaflet: set MAP_ENGINE = "leaflet"
   * ============================================================ */

  const MAP_ENGINE = "maplibre";    // <-- "maplibre"  |  "leaflet"


  /* ============================================================
   *  MAPLIBRE BLOCK
   * ============================================================ */

  if (MAP_ENGINE === "maplibre") {

    /* ---- tile sources ---- */
    const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

    /* ---- build initial style with satellite + labels ---- */
    const mapStyle = {
      version: 8,
      glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
      sources: {
        satellite: {
          type: "raster",
          tiles: [SATELLITE_TILES],
          tileSize: 256,
          attribution: "Esri, Maxar, Earthstar Geographics"
        },
        labels: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png"
          ],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap &amp; CARTO"
        }
      },
      layers: [
        { id: "satellite-layer", type: "raster", source: "satellite" },
        { id: "labels-layer",    type: "raster", source: "labels", paint: { "raster-opacity": 0.9 } }
      ]
    };

    /* ---- initialise map ---- */
    const map = new maplibregl.Map({
      container:  "map",
      style:      mapStyle,
      center:     INDIA_CENTER_LNG_LAT,
      zoom:       DEFAULT_ZOOM,
      minZoom:    2.5,
      maxZoom:    14,
    });

    map.setMaxBounds([[55.0, 1.0], [110.0, 45.0]]);

    /* ---- after map style loads, add fire data layers ---- */
    map.on("load", async () => {

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

      /* ── 1. FETCH DATA FROM DJANGO BACKEND ── */
      const firmsData = await fetchFIRMSData();

      /* ── 2. BUILD GEOJSON ── */
      const hotspotGeoJSON = {
        type: "FeatureCollection",
        features: firmsData.map((f, index) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [
              parseFloat(f.longitude),
              parseFloat(f.latitude)
            ]
          },
          properties: {
            id:         index + 1,
            ecoregion:  "India",
            frp:        parseFloat(f.frp || 0),
            fwi:        15 + Math.random() * 20,
            dsr:        5  + Math.random() * 10,
            source:     "NASA FIRMS",
            date:       f.acq_date,
            confidence: f.confidence || "N/A",
            lat:        parseFloat(f.latitude),
            lon:        parseFloat(f.longitude),
            radius:     Math.min(18, 6 + Math.sqrt(parseFloat(f.frp || 0)) / 4),
            color:      frpColor(parseFloat(f.frp || 0)),
            heatWeight: Math.min(1, parseFloat(f.frp || 0) / 100)
          }
        }))
      };

      console.log("[LSI] Loaded hotspots:", hotspotGeoJSON.features.length);

      /* Update HUD counter */
      const fireCountEl = document.getElementById("fire-count");
      if (fireCountEl) fireCountEl.textContent = hotspotGeoJSON.features.length;

      /* ── 3. REGISTER SOURCE (only once, inside load) ── */
      map.addSource("hotspots", { type: "geojson", data: hotspotGeoJSON });

      /* ── 4. HEATMAP LAYER ── */
      map.addLayer({
        id:      "layer-heat",
        type:    "heatmap",
        source:  "hotspots",
        maxzoom: 11,
        paint: {
          "heatmap-weight":     ["get", "heatWeight"],
          "heatmap-intensity":  ["interpolate", ["linear"], ["zoom"], 4, 0.6, 9, 2],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0,   "rgba(33,102,172,0)",
            0.2, "rgb(103,169,207)",
            0.4, "rgb(253,219,199)",
            0.6, "rgb(239,138,98)",
            0.8, "rgb(178,24,43)",
            1,   "rgb(103,0,31)"
          ],
          "heatmap-radius":  ["interpolate", ["linear"], ["zoom"], 4, 20, 9, 40],
          "heatmap-opacity": 0.72
        }
      });

      /* ── 5. FIRE MARKER CIRCLES ── */
      map.addLayer({
        id:      "layer-fires-circle",
        type:    "circle",
        source:  "hotspots",
        minzoom: 5,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            5,  ["*", ["get", "radius"], 0.5],
            10, ["get", "radius"]
          ],
          "circle-color":        ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
          "circle-opacity":      0.88
        }
      });

      /* ── 6. FWI DANGER LABEL ── */
      map.addLayer({
        id:      "layer-fires-label",
        type:    "symbol",
        source:  "hotspots",
        minzoom: 8,
        layout: {
          "text-field":  ["concat", ["to-string", ["round", ["get", "fwi"]]], " FWI"],
          "text-font":   ["Open Sans Bold"],
          "text-size":   11,
          "text-offset": [0, -1.8],
          "text-anchor": "bottom"
        },
        paint: {
          "text-color":      "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.7)",
          "text-halo-width": 1.5
        }
      });

      /* ── 7. CLICK → fire detail panel + popup ── */
      map.on("click", "layer-fires-circle", (e) => {
        const props = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates.slice();

        new maplibregl.Popup({ maxWidth: "280px" })
          .setLngLat(coords)
          .setHTML(popupHtml(props))
          .addTo(map);

        showFireDetail(props);
        e.originalEvent.stopPropagation();
      });

      map.on("mouseenter", "layer-fires-circle", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "layer-fires-circle", () => { map.getCanvas().style.cursor = ""; });

      /* ── 8. OVERLAY TOGGLE CHECKBOXES ── */

      document.getElementById("layer-fires")?.addEventListener("change", (e) => {
        const vis = e.target.checked ? "visible" : "none";
        ["layer-fires-circle", "layer-fires-label"].forEach((id) => {
          map.setLayoutProperty(id, "visibility", vis);
        });
      });

      document.getElementById("layer-heat")?.addEventListener("change", (e) => {
        map.setLayoutProperty("layer-heat", "visibility",
          e.target.checked ? "visible" : "none");
      });

      document.getElementById("layer-labels")?.addEventListener("change", (e) => {
        map.setLayoutProperty("labels-layer", "visibility",
          e.target.checked ? "visible" : "none");
      });

      /* ── 9. ADMINISTRATIVE BOUNDARY OVERLAYS ── */

      const BOUNDARY_URLS = {
        states:    "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson",
        districts: "https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson",
        divisions: "https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@main/geojson/india.geojson"
      };

      const BOUNDARY_STYLES = {
        states:    { color: "#fb923c", lineWidth: 2.0, dash: null,  fillOpacity: 0.05 },
        districts: { color: "#facc15", lineWidth: 1.2, dash: [5,3], fillOpacity: 0.03 },
        divisions: { color: "#818cf8", lineWidth: 0.8, dash: [3,3], fillOpacity: 0.02 }
      };

      const EMPTY_FC = { type: "FeatureCollection", features: [] };

      ["states", "districts", "divisions"].forEach((key) => {
        const s = BOUNDARY_STYLES[key];

        map.addSource("bnd-" + key, { type: "geojson", data: EMPTY_FC });

        map.addLayer({
          id:     "bnd-" + key + "-fill",
          type:   "fill",
          source: "bnd-" + key,
          paint:  { "fill-color": s.color, "fill-opacity": s.fillOpacity },
          layout: { visibility: "none" }
        });

        const lp = { "line-color": s.color, "line-width": s.lineWidth, "line-opacity": 0.85 };
        if (s.dash) lp["line-dasharray"] = s.dash;
        map.addLayer({
          id:     "bnd-" + key + "-line",
          type:   "line",
          source: "bnd-" + key,
          paint:  lp,
          layout: { visibility: "none" }
        });

        map.on("click", "bnd-" + key + "-fill", (e) => {
          const p = e.features[0].properties;
          const name =
            p.NAME_1 || p.NAME_2 || p.ST_NM || p.DISTRICT || p.SUBDISTT ||
            p.state   || p.district || p.division || p.name || "—";
          const label = { states: "State", districts: "District", divisions: "Division" }[key];
          new maplibregl.Popup({ maxWidth: "220px" })
            .setLngLat(e.lngLat)
            .setHTML(`<div class="map-popup"><strong>${label}</strong><br>${name}</div>`)
            .addTo(map);
          e.originalEvent.stopPropagation();
        });
        map.on("mouseenter", "bnd-" + key + "-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "bnd-" + key + "-fill", () => { map.getCanvas().style.cursor = ""; });
      });

      /* Wire boundary checkboxes */
      ["states", "districts", "divisions"].forEach((key) => {
        const el = document.getElementById("layer-" + key);
        if (!el) return;

        function applyVisibility(checked) {
          const vis = checked ? "visible" : "none";
          ["bnd-" + key + "-fill", "bnd-" + key + "-line"].forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
          });
        }

        el.addEventListener("change", (e) => applyVisibility(e.target.checked));
        if (el.checked) applyVisibility(true);
      });

      /* Fetch boundary GeoJSON async */
      async function fetchBoundary(key) {
        try {
          const res = await fetch(BOUNDARY_URLS[key]);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const geojson = await res.json();
          const src = map.getSource("bnd-" + key);
          if (src) src.setData(geojson);
          console.log(`[LSI] Boundary "${key}" loaded — ${geojson.features?.length ?? "?"} features`);
        } catch (err) {
          console.warn(`[LSI] Boundary "${key}" failed:`, err.message);
        }
      }

      fetchBoundary("states");
      setTimeout(() => fetchBoundary("districts"), 300);
      setTimeout(() => fetchBoundary("divisions"), 600);

    }); // end map.on("load")


    /* ── 10. CLICK → show coordinates (only when not clicking a marker) ── */
    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["layer-fires-circle"] });
      if (features.length > 0) return;

      const lng = e.lngLat.lng.toFixed(6);
      const lat = e.lngLat.lat.toFixed(6);
      new maplibregl.Popup()
        .setLngLat([lng, lat])
        .setHTML(`<b>Coordinates</b><br>Latitude: ${lat}<br>Longitude: ${lng}`)
        .addTo(map);
    });

    /* ── 11. FLY-TO helper ── */
    window._mapFlyTo = (lat, lon) => {
      map.flyTo({ center: [lon, lat], zoom: 10, duration: 1200 });
    };

  } // end MapLibre block


  /* ============================================================
   *  LEAFLET BLOCK (preserved, activate by setting MAP_ENGINE = "leaflet")
   * ============================================================ */

  if (MAP_ENGINE === "leaflet") {

    const baseLayers = {
      satellite: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri, Maxar, Earthstar", maxZoom: 18 }
      ),
      terrain: L.tileLayer(
        "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        { attribution: "OpenTopoMap", maxZoom: 17 }
      ),
      dark: L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { attribution: "CARTO", maxZoom: 19 }
      )
    };

    const map = L.map("map", {
      center:             INDIA_CENTER_LL,
      zoom:               5,
      minZoom:            4,
      maxZoom:            12,
      maxBounds:          INDIA_BOUNDS,
      maxBoundsViscosity: 0.85,
    });

    baseLayers.satellite.addTo(map);

    const labelsPane = map.createPane("labels");
    labelsPane.style.zIndex        = 650;
    labelsPane.style.pointerEvents = "none";

    const labelsLayer = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
      { subdomains: "abcd", pane: "labels", attribution: "&copy; OpenStreetMap &amp; CARTO" }
    );
    labelsLayer.addTo(map);

    const fireLayer = L.layerGroup();

    data.hotspots.forEach((f) => {
      const radius = Math.min(18, 6 + Math.sqrt(f.frp) / 4);
      const marker = L.circleMarker([f.lat, f.lon], {
        radius,
        color:       "#ffffff",
        weight:      1,
        fillColor:   frpColor(f.frp),
        fillOpacity: 0.85,
      });
      marker.bindPopup(popupHtml(f));
      marker.on("click", () => showFireDetail(f));
      fireLayer.addLayer(marker);
    });

    fireLayer.addTo(map);

    const heatPoints = data.hotspots.map((f) => [f.lat, f.lon, Math.min(1, f.fwi / 45)]);
    const heatLayer  = L.heatLayer(heatPoints, { radius: 28, blur: 22, maxZoom: 10 });

    const overlays = {
      "Active fires":           fireLayer,
      "FWI heat (ERA5+CFFDRS)": heatLayer,
      "Place labels":           labelsLayer,
    };

    L.control.layers(baseLayers, overlays, { position: "topright", collapsed: false }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    document.getElementById("layer-fires")?.addEventListener("change", (e) => {
      if (e.target.checked) map.addLayer(fireLayer);
      else                   map.removeLayer(fireLayer);
    });
    document.getElementById("layer-heat")?.addEventListener("change", (e) => {
      if (e.target.checked) map.addLayer(heatLayer);
      else                   map.removeLayer(heatLayer);
    });

    map.on("click", (e) => {
      const lat = e.latlng.lat.toFixed(6);
      const lon = e.latlng.lng.toFixed(6);
      L.popup()
        .setLatLng(e.latlng)
        .setContent(`<b>Coordinates</b><br>Latitude: ${lat}<br>Longitude: ${lon}`)
        .openOn(map);
    });

    map.fitBounds(INDIA_BOUNDS, { padding: [20, 20] });

    window._mapFlyTo = (lat, lon) => {
      map.setView([lat, lon], 9, { animate: true });
    };

  } // end Leaflet block


  /* ============================================================
   *  SHARED UI LOGIC
   * ============================================================ */

  /* ── Sidebar: CFFDRS index values ── */
  if (data) {
    const idx = data.nationalIndices;
    const indexEls = {
      ffmc: document.querySelector('[data-index="ffmc"]'),
      dmc:  document.querySelector('[data-index="dmc"]'),
      dc:   document.querySelector('[data-index="dc"]'),
      isi:  document.querySelector('[data-index="isi"]'),
      bui:  document.querySelector('[data-index="bui"]'),
      fwi:  document.querySelector('[data-index="fwi"]'),
      dsr:  document.querySelector('[data-index="dsr"]'),
    };
    Object.keys(indexEls).forEach((k) => {
      if (indexEls[k]) {
        indexEls[k].textContent =
          typeof idx[k] === "number" ? idx[k].toFixed(1) : idx[k];
      }
    });

    const dataDateEl = document.getElementById("data-date");
    if (dataDateEl) dataDateEl.textContent = data.updated;
  }

  /* ── Ecoregion chart ── */
  const ecoSelect = document.getElementById("ecoregion-select");
  if (data && ecoSelect) {
    data.ecoregions.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      ecoSelect.appendChild(opt);
    });
  }

  function slugify(name) {
    return name.replace(/\s+/g, "_");
  }

  function loadEcoregionChart(name) {
    const img         = document.getElementById("ecoregion-chart");
    const caption     = document.getElementById("ecoregion-caption");
    const placeholder = document.getElementById("chart-placeholder");
    if (!img || !caption || !placeholder) return;
    caption.textContent = name;
    const slug  = slugify(name).toLowerCase();
    const files = window.LSI_ECOREGION_FILES || [];
    const match = files.find((f) =>
      f.toLowerCase().replace(/-/g, "_").startsWith(slug)
    );
    img.alt = `FWI vs FRP — ${name}`;
    if (match) {
      img.src                   = "/assets/ecoregions/" + match;
      img.style.display         = "block";
      placeholder.style.display = "none";
    } else {
      img.src                   = "";
      img.style.display         = "none";
      placeholder.style.display = "flex";
      placeholder.textContent   = `No chart file for "${name}" in assets/ecoregions/`;
    }
  }

  if (ecoSelect) {
    ecoSelect.addEventListener("change", () => loadEcoregionChart(ecoSelect.value));
    loadEcoregionChart(ecoSelect.value);
  }

  /* ── Fire detail panel ── */
  const detailPanel = document.getElementById("fire-detail");

  function showFireDetail(f) {
    if (!detailPanel) return;
    detailPanel.hidden = false;
    detailPanel.innerHTML = `
      <button type="button" class="btn btn-sm" id="close-detail" style="float:right;margin:0">Close</button>
      <h3>Fire detection #${f.id}</h3>
      <p class="detail-eco">${f.ecoregion}</p>
      <dl class="detail-dl">
        <dt>Coordinates</dt>
        <dd>${(+f.lat).toFixed(3)}°N, ${(+f.lon).toFixed(3)}°E</dd>
        <dt>FRP (satellite)</dt>
        <dd>${f.frp} MW — ${f.source}</dd>
        <dt>FWI (CFFDRS)</dt>
        <dd>${(+f.fwi).toFixed(1)}</dd>
        <dt>DSR</dt>
        <dd>${(+f.dsr).toFixed(1)}</dd>
        <dt>Confidence</dt>
        <dd>${f.confidence}</dd>
      </dl>
      <button type="button" class="btn btn-sm" id="fly-to-fire">Zoom to location</button>
    `;
    document.getElementById("fly-to-fire")?.addEventListener("click", () => {
      window._mapFlyTo(+f.lat, +f.lon);
    });
    document.getElementById("close-detail")?.addEventListener("click", () => {
      detailPanel.hidden = true;
    });
    if (ecoSelect && [...ecoSelect.options].some((o) => o.value === f.ecoregion)) {
      ecoSelect.value = f.ecoregion;
    }
    loadEcoregionChart(f.ecoregion);
  }

  /* ── Sidebar collapse ── */
  document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });

  /* ── Auth UI (optional sign-in; dashboard stays public) ── */
  const btnSignIn = document.getElementById("btn-signin");
  const btnLogout = document.getElementById("btn-logout");

  async function refreshAuthUI() {
    try {
      const res = await fetch("/api/auth/status/");
      const auth = await res.json();
      if (auth.authenticated) {
        if (btnSignIn) btnSignIn.hidden = true;
        if (btnLogout) btnLogout.hidden = false;
      } else {
        if (btnSignIn) btnSignIn.hidden = false;
        if (btnLogout) btnLogout.hidden = true;
      }
    } catch {
      if (btnSignIn) btnSignIn.hidden = false;
      if (btnLogout) btnLogout.hidden = true;
    }
  }

  refreshAuthUI();

  btnLogout?.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        credentials: "same-origin",
      });
    } catch { /* ignore */ }
    window.location.href = "/login/";
  });

  function getCsrfToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

})();
