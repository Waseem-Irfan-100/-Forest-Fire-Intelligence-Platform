(function () {
  const INDIA_BOUNDS = [[6.5, 68.0], [37.5, 97.5]];
  const data = window.LSI_FIRE_DATA;

  const map = L.map("map", {
    center: [22.5, 79.0],
    zoom: 5,
    minZoom: 4,
    maxZoom: 12,
    maxBounds: INDIA_BOUNDS,
    maxBoundsViscosity: 0.85,
  });

  const baseLayers = {
    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri, Maxar, Earthstar", maxZoom: 18 }
    ),
    terrain: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      attribution: "OpenTopoMap",
      maxZoom: 17,
    }),
    dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "CARTO",
      maxZoom: 19,
    }),
  };

  baseLayers.satellite.addTo(map);

  const fireLayer = L.layerGroup();
  const heatLayer = L.heatLayer([], { radius: 28, blur: 22, maxZoom: 10 });

  function frpColor(frp) {
    if (frp >= 1000) return "#ef4444";
    if (frp >= 500) return "#f97316";
    if (frp >= 200) return "#eab308";
    return "#60a5fa";
  }

  function fwiClass(fwi) {
    if (fwi >= 35) return { label: "Extreme", cls: "risk-extreme" };
    if (fwi >= 25) return { label: "Very High", cls: "risk-very-high" };
    if (fwi >= 15) return { label: "High", cls: "risk-high" };
    if (fwi >= 5) return { label: "Moderate", cls: "risk-moderate" };
    return { label: "Low", cls: "risk-low" };
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
        </motion.div>
        <span class="popup-badge ${risk.cls}">${risk.label} danger</span>
      </div>`;
  }

  data.hotspots.forEach((f) => {
    const radius = Math.min(18, 6 + Math.sqrt(f.frp) / 4);
    const marker = L.circleMarker([f.lat, f.lon], {
      radius,
      color: "#fff",
      weight: 1,
      fillColor: frpColor(f.frp),
      fillOpacity: 0.85,
    });
    marker.bindPopup(popupHtml(f));
    marker.on("click", () => showFireDetail(f));
    fireLayer.addLayer(marker);
  });

  fireLayer.addTo(map);

  const heatPoints = data.hotspots.map((f) => [f.lat, f.lon, Math.min(1, f.fwi / 45)]);
  heatLayer.setLatLngs(heatPoints);

  const overlays = {
    "Active fires": fireLayer,
    "FWI heat (ERA5 + CFFDRS)": heatLayer,
  };

  L.control.layers(baseLayers, overlays, { position: "topright", collapsed: false }).addTo(map);

  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

  /* ── Sidebar: CFFDRS indices ── */
  const idx = data.nationalIndices;
  const indexEls = {
    ffmc: document.querySelector('[data-index="ffmc"]'),
    dmc: document.querySelector('[data-index="dmc"]'),
    dc: document.querySelector('[data-index="dc"]'),
    isi: document.querySelector('[data-index="isi"]'),
    bui: document.querySelector('[data-index="bui"]'),
    fwi: document.querySelector('[data-index="fwi"]'),
    dsr: document.querySelector('[data-index="dsr"]'),
  };
  Object.keys(indexEls).forEach((k) => {
    if (indexEls[k]) indexEls[k].textContent = typeof idx[k] === "number" ? idx[k].toFixed(1) : idx[k];
  });

  document.getElementById("fire-count").textContent = data.hotspots.length;
  document.getElementById("data-date").textContent = data.updated;

  /* ── Ecoregion select + chart ── */
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
    const img = document.getElementById("ecoregion-chart");
    const caption = document.getElementById("ecoregion-caption");
    const placeholder = document.getElementById("chart-placeholder");
    caption.textContent = name;
    const slug = slugify(name).toLowerCase();
    const dir = "assets/ecoregions/";
    img.alt = `FWI vs FRP — ${name}`;

    const files = window.LSI_ECOREGION_FILES || [];
    const match = files.find((f) => f.toLowerCase().replace(/-/g, "_").startsWith(slug));

    if (match) {
      img.src = dir + match;
      img.style.display = "block";
      placeholder.style.display = "none";
    } else {
      img.src = "";
      img.style.display = "none";
      placeholder.style.display = "flex";
      placeholder.textContent = `No chart file for "${name}" in assets/ecoregions/`;
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
        <dt>Coordinates</dt><dd>${f.lat.toFixed(3)}°N, ${f.lon.toFixed(3)}°E</dd>
        <dt>FRP (satellite)</dt><dd>${f.frp} MW — ${f.source}</dd>
        <dt>FWI (CFFDRS)</dt><dd>${f.fwi.toFixed(1)}</dd>
        <dt>DSR</dt><dd>${f.dsr.toFixed(1)}</dd>
        <dt>Confidence</dt><dd>${f.confidence}</dd>
      </dl>
      <button type="button" class="btn btn-sm" id="fly-to-fire">Zoom to location</button>
    `;
    document.getElementById("fly-to-fire").addEventListener("click", () => {
      map.setView([f.lat, f.lon], 9);
    });
    document.getElementById("close-detail").addEventListener("click", () => {
      detailPanel.hidden = true;
    });
    if ([...ecoSelect.options].some((o) => o.value === f.ecoregion)) {
      ecoSelect.value = f.ecoregion;
    }
    loadEcoregionChart(f.ecoregion);
  }

  /* ── Layer toggles ── */
  document.getElementById("layer-fires").addEventListener("change", (e) => {
    if (e.target.checked) map.addLayer(fireLayer);
    else map.removeLayer(fireLayer);
  });
  document.getElementById("layer-heat").addEventListener("change", (e) => {
    if (e.target.checked) map.addLayer(heatLayer);
    else map.removeLayer(heatLayer);
  });

  document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });

  document.getElementById("btn-logout")?.addEventListener("click", () => {
    sessionStorage.removeItem("lsi_auth");
    window.location.href = "login.html";
  });

  /* Fit India */
  map.fitBounds(INDIA_BOUNDS, { padding: [20, 20] });
})();
