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

  function popupHtml(f) {
    const risk = fwiClass(f.fwi);
    return `
      <div class="map-popup">
        <strong>${f.ecoregion}</strong>
        <div class="popup-grid">
          <span>FRP</span><b>${f.frp} MW</b>
          <span>FWI</span><b class="${risk.cls}">${f.fwi.toFixed(1)}</b>
          <span>DSR</span><b>${f.dsr.toFixed(1)}</b>
          <span>Source</span><b>${f.source}</b>
          <span>Date</span><b>${f.date}</b>
        </div>
        <span class="popup-badge ${risk.cls}">${risk.label} danger</span>
      </div>`;
  }


  /* ============================================================
   *  ██╗     ███████╗ █████╗ ███████╗██╗     ███████╗████████╗
   *  ██║     ██╔════╝██╔══██╗██╔════╝██║     ██╔════╝╚══██╔══╝
   *  ██║     █████╗  ███████║█████╗  ██║     █████╗     ██║
   *  ██║     ██╔══╝  ██╔══██║██╔══╝  ██║     ██╔══╝     ██║
   *  ███████╗███████╗██║  ██║██║     ███████╗███████╗   ██║
   *  ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝╚══════╝   ╚═╝
   *
   *  To switch to Leaflet:
   *    1. Set MAP_ENGINE = "leaflet" below
   *    2. Replace the MapLibre <script> tag in your HTML with:
   *         <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
   *         <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
   *         <script src="https://unpkg.com/leaflet.heat/dist/leaflet-heat.js"></script>
   *    3. No other changes needed — the rest is handled below.
   * ============================================================ */

  const MAP_ENGINE = "maplibre";    // <-- "maplibre"  |  "leaflet"


  /* ============================================================
   *  ██████╗ ██╗      ██████╗  ██████╗██╗  ██╗
   *  ██╔══██╗██║     ██╔═══██╗██╔════╝██║ ██╔╝
   *  ██████╔╝██║     ██║   ██║██║     █████╔╝
   *  ██╔══██╗██║     ██║   ██║██║     ██╔═██╗
   *  ██████╔╝███████╗╚██████╔╝╚██████╗██║  ██╗
   *  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝
   *
   *  Full implementation — place labels, fire markers,
   *  heatmap, overlay toggles, popups, coordinate click.
   * ============================================================ */

  if (MAP_ENGINE === "maplibre") {

    /* ---- tile sources ---- */
    const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    const LABELS_TILES    = "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png";

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
        /* Raster label overlay from CartoDB (fastest, no vector auth needed) */
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
        /* Labels sit on top — togglable via overlay control */
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

    /* Wider bounds — shows neighbours, allows zoom-out */
    map.setMaxBounds([[55.0, 1.0], [110.0, 45.0]]);

    /* ---- after map style loads, add fire data layers ---- */
    map.on("load", () => {

      /* Controls added here — ONCE, after load, no duplicates */
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      /* bottom-right avoids overlap with MapLibre attribution (bottom-left) */
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

      /* ── 1. BUILD GEOJSON FROM DATA ── */

      const hotspotGeoJSON = {
        type: "FeatureCollection",
        features: data.hotspots.map((f) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [f.lon, f.lat] },
          properties: {
            id:         f.id,
            ecoregion:  f.ecoregion,
            frp:        f.frp,
            fwi:        f.fwi,
            dsr:        f.dsr,
            source:     f.source,
            date:       f.date,
            confidence: f.confidence,
            /* radius: 6–18 px based on FRP, matching original Leaflet logic */
            radius: Math.min(18, 6 + Math.sqrt(f.frp) / 4),
            color:  frpColor(f.frp),
            /* heat weight 0–1 for heatmap layer */
            heatWeight: Math.min(1, f.fwi / 45)
          }
        }))
      };

      /* ── 2. REGISTER SOURCE ── */
      map.addSource("hotspots", { type: "geojson", data: hotspotGeoJSON });

      /* ── 3. HEATMAP LAYER ── */
      map.addLayer({
        id:     "layer-heat",
        type:   "heatmap",
        source: "hotspots",
        maxzoom: 11,
        paint: {
          /* weight based on fwi/45 (0–1) */
          "heatmap-weight": ["get", "heatWeight"],
          /* intensity ramps with zoom */
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 9, 2],
          /* colour ramp: blue → yellow → red */
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0,    "rgba(33,102,172,0)",
            0.2,  "rgb(103,169,207)",
            0.4,  "rgb(253,219,199)",
            0.6,  "rgb(239,138, 98)",
            0.8,  "rgb(178, 24, 43)",
            1,    "rgb(103,  0, 31)"
          ],
          "heatmap-radius":  ["interpolate", ["linear"], ["zoom"], 4, 20, 9, 40],
          "heatmap-opacity": 0.72
        }
      });

      /* ── 4. FIRE MARKER CIRCLES (visible at zoom ≥ 7) ── */
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

      /* ── 5. FWI DANGER LABEL on each marker ── */
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

      /* ── 6. CLICK → fire detail panel + popup ── */
      map.on("click", "layer-fires-circle", (e) => {
        const props = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates.slice();

        new maplibregl.Popup({ maxWidth: "280px" })
          .setLngLat(coords)
          .setHTML(popupHtml(props))
          .addTo(map);

        showFireDetail(props);
        e.originalEvent.stopPropagation(); // prevent coordinate popup below
      });

      /* pointer cursor on hover */
      map.on("mouseenter", "layer-fires-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "layer-fires-circle", () => {
        map.getCanvas().style.cursor = "";
      });

      /* ── 7. OVERLAY TOGGLE CHECKBOXES ── */

      /* fires toggle */
      document.getElementById("layer-fires").addEventListener("change", (e) => {
        const vis = e.target.checked ? "visible" : "none";
        ["layer-fires-circle", "layer-fires-label"].forEach((id) => {
          map.setLayoutProperty(id, "visibility", vis);
        });
      });

      /* heatmap toggle */
      document.getElementById("layer-heat").addEventListener("change", (e) => {
        map.setLayoutProperty("layer-heat", "visibility",
          e.target.checked ? "visible" : "none");
      });

      /* labels toggle (new checkbox — add id="layer-labels" to your HTML) */
      const labelsToggle = document.getElementById("layer-labels");
      if (labelsToggle) {
        labelsToggle.addEventListener("change", (e) => {
          map.setLayoutProperty("labels-layer", "visibility",
            e.target.checked ? "visible" : "none");
        });
      }

      /* ── 10. ADMINISTRATIVE BOUNDARY OVERLAYS ── */

      /*
       *  URLs via cdn.jsdelivr.net (CSP-allowlisted).
       *  States   : geohacker/india — small, reliable
       *  Districts: geohacker/india — ~2 MB, loads in ~2–3 s
       *  Divisions: udit-001/india-maps-data tehsil-level GeoJSON
       *
       *  Strategy:
       *   1. Register each MapLibre source immediately with empty data
       *   2. Add fill + line layers (hidden by default)
       *   3. Wire checkboxes immediately — no waiting on fetch
       *   4. Fetch GeoJSON async; update source data when ready
       */

      const BOUNDARY_URLS = {
        states: "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson",
        districts: "https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson",
        divisions: "https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@main/geojson/india.geojson"
      };

      const BOUNDARY_STYLES = {
        states:    { color: "#fb923c", lineWidth: 2.0, dash: null,  fillOpacity: 0.05 },
        districts: { color: "#facc15", lineWidth: 1.2, dash: [5,3], fillOpacity: 0.03 },
        divisions: { color: "#818cf8", lineWidth: 0.8, dash: [3,3], fillOpacity: 0.02 }
      };

      const EMPTY_FC = { type: "FeatureCollection", features: [] };

      /* 1. Register sources + layers immediately with empty data */
      ["states", "districts", "divisions"].forEach((key) => {
        const s = BOUNDARY_STYLES[key];

        map.addSource("bnd-" + key, { type: "geojson", data: EMPTY_FC });

        /* fill (hit area + very faint tint) */
        map.addLayer({
          id:     "bnd-" + key + "-fill",
          type:   "fill",
          source: "bnd-" + key,
          paint:  { "fill-color": s.color, "fill-opacity": s.fillOpacity },
          layout: { visibility: "none" }
        });

        /* line */
        const lp = { "line-color": s.color, "line-width": s.lineWidth, "line-opacity": 0.85 };
        if (s.dash) lp["line-dasharray"] = s.dash;
        map.addLayer({
          id:     "bnd-" + key + "-line",
          type:   "line",
          source: "bnd-" + key,
          paint:  lp,
          layout: { visibility: "none" }
        });

        /* click popup */
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

      /* 2. Wire checkboxes immediately — layers already exist */
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
        /* Apply initial state right now */
        if (el.checked) applyVisibility(true);
      });

      /* 3. Fetch GeoJSON async and hydrate sources */
      async function fetchBoundary(key) {
        const url = BOUNDARY_URLS[key];
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const geojson = await res.json();
          const src = map.getSource("bnd-" + key);
          if (src) src.setData(geojson);
          console.log(`[LSI] Boundary "${key}" loaded — ${geojson.features?.length ?? "?"} features`);
        } catch (err) {
          console.warn(`[LSI] Boundary "${key}" failed:`, err.message);
        }
      }

      /* Load states first (small), then districts, then divisions */
      fetchBoundary("states");
      setTimeout(() => fetchBoundary("districts"), 300);
      setTimeout(() => fetchBoundary("divisions"), 600);

    }); // end map.on("load")


    /* ── 8. CLICK → show coordinates (only when not clicking a marker) ── */
    map.on("click", (e) => {
      /* skip if a marker was already clicked */
      const features = map.queryRenderedFeatures(e.point, { layers: ["layer-fires-circle"] });
      if (features.length > 0) return;

      const lng = e.lngLat.lng.toFixed(6);
      const lat = e.lngLat.lat.toFixed(6);
      new maplibregl.Popup()
        .setLngLat([lng, lat])
        .setHTML(`<b>Coordinates</b><br>Latitude: ${lat}<br>Longitude: ${lng}`)
        .addTo(map);

      console.log("Coordinates:", lat, lng);
    });

    /* ── 9. FLY-TO helper (used by fire detail panel) ── */
    window._mapFlyTo = (lat, lon) => {
      map.flyTo({ center: [lon, lat], zoom: 10, duration: 1200 });
    };

  } // end MapLibre block


  /* ============================================================
   *  ██╗     ███████╗ █████╗ ███████╗██╗     ███████╗████████╗
   *  ██║     ██╔════╝██╔══██╗██╔════╝██║     ██╔════╝╚══██╔══╝
   *  ██║     █████╗  ███████║█████╗  ██║     █████╗     ██║
   *  ██║     ██╔══╝  ██╔══██║██╔══╝  ██║     ██╔══╝     ██║
   *  ███████╗███████╗██║  ██║██║     ███████╗███████╗   ██║
   *  ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝╚══════╝   ╚═╝
   *
   *  Full Leaflet implementation — preserved, ready to activate.
   *  Requires: leaflet.js, leaflet.css, leaflet-heat.js
   * ============================================================ */

  if (MAP_ENGINE === "leaflet") {

    /* ---- base tile layers ---- */
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

    /* ---- init map ---- */
    const map = L.map("map", {
      center:              INDIA_CENTER_LL,
      zoom:                5,
      minZoom:             4,
      maxZoom:             12,
      maxBounds:           INDIA_BOUNDS,
      maxBoundsViscosity:  0.85,
    });

    baseLayers.satellite.addTo(map);

    /* ---- place labels pane (sits above tiles, below popups) ---- */
    const labelsPane = map.createPane("labels");
    labelsPane.style.zIndex        = 650;
    labelsPane.style.pointerEvents = "none";

    const labelsLayer = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
      { subdomains: "abcd", pane: "labels", attribution: "&copy; OpenStreetMap &amp; CARTO" }
    );
    labelsLayer.addTo(map);

    /* ---- fire marker layer ---- */
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

    /* ---- heatmap layer ---- */
    const heatPoints = data.hotspots.map((f) => [f.lat, f.lon, Math.min(1, f.fwi / 45)]);
    const heatLayer  = L.heatLayer(heatPoints, { radius: 28, blur: 22, maxZoom: 10 });

    /* ---- layer control ---- */
    const overlays = {
      "Active fires":           fireLayer,
      "FWI heat (ERA5+CFFDRS)": heatLayer,
      "Place labels":           labelsLayer,
    };

    L.control.layers(baseLayers, overlays, { position: "topright", collapsed: false }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    /* ---- overlay toggle checkboxes (sidebar) ---- */
    document.getElementById("layer-fires").addEventListener("change", (e) => {
      if (e.target.checked) map.addLayer(fireLayer);
      else                   map.removeLayer(fireLayer);
    });
    document.getElementById("layer-heat").addEventListener("change", (e) => {
      if (e.target.checked) map.addLayer(heatLayer);
      else                   map.removeLayer(heatLayer);
    });

    /* ---- click → show coordinates ---- */
    map.on("click", (e) => {
      const lat = e.latlng.lat.toFixed(6);
      const lon = e.latlng.lng.toFixed(6);
      L.popup()
        .setLatLng(e.latlng)
        .setContent(`<b>Coordinates</b><br>Latitude: ${lat}<br>Longitude: ${lon}`)
        .openOn(map);
      console.log("Clicked coordinates:", lat, lon);
    });

    /* ---- fit to India ---- */
    map.fitBounds(INDIA_BOUNDS, { padding: [20, 20] });

    /* ---- fly-to helper ---- */
    window._mapFlyTo = (lat, lon) => {
      map.setView([lat, lon], 9, { animate: true });
    };

  } // end Leaflet block


  /* ============================================================
   *  SHARED UI LOGIC
   *  Works with both engines — uses window._mapFlyTo() above
   * ============================================================ */

  /* ── Sidebar: CFFDRS index values ── */
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

  document.getElementById("fire-count").textContent = data.hotspots.length;
  document.getElementById("data-date").textContent  = data.updated;

  /* ── Ecoregion chart ── */
  const ecoSelect = document.getElementById("ecoregion-select");
  data.ecoregions.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    ecoSelect.appendChild(opt);
  });

  function slugify(name) {
    return name.replace(/\s+/g, "_");
  }

  function loadEcoregionChart(name) {
    const img         = document.getElementById("ecoregion-chart");
    const caption     = document.getElementById("ecoregion-caption");
    const placeholder = document.getElementById("chart-placeholder");
    caption.textContent = name;
    const slug  = slugify(name).toLowerCase();
    const files = window.LSI_ECOREGION_FILES || [];
    const match = files.find((f) =>
      f.toLowerCase().replace(/-/g, "_").startsWith(slug)
    );
    img.alt = `FWI vs FRP — ${name}`;
    if (match) {
      img.src             = "assets/ecoregions/" + match;
      img.style.display   = "block";
      placeholder.style.display = "none";
    } else {
      img.src             = "";
      img.style.display   = "none";
      placeholder.style.display  = "flex";
      placeholder.textContent    = `No chart file for "${name}" in assets/ecoregions/`;
    }
  }

  ecoSelect.addEventListener("change", () => loadEcoregionChart(ecoSelect.value));
  loadEcoregionChart(ecoSelect.value);

  /* ── Fire detail panel ── */
  const detailPanel = document.getElementById("fire-detail");

  function showFireDetail(f) {
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
    document.getElementById("fly-to-fire").addEventListener("click", () => {
      window._mapFlyTo(+f.lat, +f.lon);
    });
    document.getElementById("close-detail").addEventListener("click", () => {
      detailPanel.hidden = true;
    });
    if ([...ecoSelect.options].some((o) => o.value === f.ecoregion)) {
      ecoSelect.value = f.ecoregion;
    }
    loadEcoregionChart(f.ecoregion);
  }

  /* ── Sidebar collapse ── */
  document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });

  /* ── Logout ── */
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    sessionStorage.removeItem("lsi_auth");
    window.location.href = "login.html";
  });

})();
