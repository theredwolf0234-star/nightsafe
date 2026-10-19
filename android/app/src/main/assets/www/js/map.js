/**
 * SafeRoute.AI - Map Management & Geo-Visualizer
 * Mapbox GL JS integrations, multi-route styling, safe haven markers, and safety heatmaps.
 */

// Zero-configuration, 100% free, NO API KEY required, high-performance basemap styles
const ZERO_CONFIG_MAP_STYLE = {
  version: 8,
  sources: {
    'esri-dark-base': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 16, // Critical: Esri Canvas Dark caps at level 16. Specifying maxzoom: 16 enables automatic WebGL overzooming, completely preventing Esri "Map data not yet available" placeholder tiles on mobile DPR displays!
      attribution: '&copy; Esri &mdash; SafeRoute.AI Navigation'
    },
    'esri-dark-reference': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 16
    },
    'osm-base': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    },
    'satellite-base': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; Esri World Imagery'
    }
  },
  layers: [
    {
      id: 'esri-dark-base-layer',
      type: 'raster',
      source: 'esri-dark-base',
      minzoom: 0,
      maxzoom: 22,
      layout: { visibility: 'visible' }
    },
    {
      id: 'esri-dark-reference-layer',
      type: 'raster',
      source: 'esri-dark-reference',
      minzoom: 0,
      maxzoom: 22,
      layout: { visibility: 'visible' }
    },
    {
      id: 'osm-base-layer',
      type: 'raster',
      source: 'osm-base',
      minzoom: 0,
      maxzoom: 22,
      layout: { visibility: 'none' }
    },
    {
      id: 'satellite-base-layer',
      type: 'raster',
      source: 'satellite-base',
      minzoom: 0,
      maxzoom: 22,
      layout: { visibility: 'none' }
    }
  ]
};

const ESRI_DARK_STYLE = ZERO_CONFIG_MAP_STYLE;

let currentBasemapMode = 'dark';

function setBasemapLayer(mode) {
  currentBasemapMode = mode || 'dark';
  const mapsToUpdate = [map, liveMap].filter(Boolean);

  mapsToUpdate.forEach(targetMap => {
    try {
      if (mode === 'osm') {
        if (targetMap.getLayer('esri-dark-base-layer')) targetMap.setLayoutProperty('esri-dark-base-layer', 'visibility', 'none');
        if (targetMap.getLayer('esri-dark-reference-layer')) targetMap.setLayoutProperty('esri-dark-reference-layer', 'visibility', 'none');
        if (targetMap.getLayer('satellite-base-layer')) targetMap.setLayoutProperty('satellite-base-layer', 'visibility', 'none');
        if (targetMap.getLayer('osm-base-layer')) targetMap.setLayoutProperty('osm-base-layer', 'visibility', 'visible');
      } else if (mode === 'satellite') {
        if (targetMap.getLayer('esri-dark-base-layer')) targetMap.setLayoutProperty('esri-dark-base-layer', 'visibility', 'none');
        if (targetMap.getLayer('osm-base-layer')) targetMap.setLayoutProperty('osm-base-layer', 'visibility', 'none');
        if (targetMap.getLayer('satellite-base-layer')) targetMap.setLayoutProperty('satellite-base-layer', 'visibility', 'visible');
        if (targetMap.getLayer('esri-dark-reference-layer')) targetMap.setLayoutProperty('esri-dark-reference-layer', 'visibility', 'visible');
      } else {
        // default 'dark'
        if (targetMap.getLayer('osm-base-layer')) targetMap.setLayoutProperty('osm-base-layer', 'visibility', 'none');
        if (targetMap.getLayer('satellite-base-layer')) targetMap.setLayoutProperty('satellite-base-layer', 'visibility', 'none');
        if (targetMap.getLayer('esri-dark-base-layer')) targetMap.setLayoutProperty('esri-dark-base-layer', 'visibility', 'visible');
        if (targetMap.getLayer('esri-dark-reference-layer')) targetMap.setLayoutProperty('esri-dark-reference-layer', 'visibility', 'visible');
      }
    } catch (e) {
      console.warn('Basemap layer toggle exception:', e);
    }
  });

  ['dark', 'osm', 'satellite'].forEach(m => {
    document.querySelectorAll(`.btn-layer-${m}`).forEach(btn => {
      btn.classList.toggle('active', m === currentBasemapMode);
    });
  });

  try {
    localStorage.setItem('SAFEROUTE_BASEMAP', currentBasemapMode);
  } catch {}
}

function getMapboxToken() {
  return window.MAPBOX_ACCESS_TOKEN || localStorage.getItem('MAPBOX_ACCESS_TOKEN') || '';
}

function hasValidMapboxToken() {
  const token = getMapboxToken();
  return Boolean(token && token.startsWith('pk.') && token.length > 25 && token !== 'YOUR_MAPBOX_ACCESS_TOKEN');
}

function getMapStyle() {
  if (hasValidMapboxToken()) {
    return 'mapbox://styles/mapbox/dark-v11';
  }
  return ESRI_DARK_STYLE;
}

if (hasValidMapboxToken()) {
  mapboxgl.accessToken = getMapboxToken();
} else {
  mapboxgl.accessToken = 'pk.placeholder';
}

let map = null;
let liveMap = null;
let plannerMarker = null;
let routeSources = [];
let safeHavenMarkers = [];
let heatmapActive = false;

const DEFAULT_CENTER = [77.2090, 28.6139]; // New Delhi / Urban Center
const DEFAULT_ZOOM = 12;

function initMap() {
  if (map) {
    map.resize();
    return;
  }

  const container = document.getElementById('map');
  if (!container) return;

  map = new mapboxgl.Map({
    container: 'map',
    style: getMapStyle(),
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    maxZoom: 18.5
  });

  map.addControl(new mapboxgl.NavigationControl(), 'top-right');

  map.on('load', () => {
    setupHeatmapLayers();
    loadSafeHavenMapPins();
    const saved = localStorage.getItem('SAFEROUTE_BASEMAP') || 'dark';
    if (saved !== 'dark') setBasemapLayer(saved);
  });
}

function initLiveMap() {
  if (liveMap) {
    liveMap.resize();
    return;
  }

  const container = document.getElementById('liveMap');
  if (!container) return;

  liveMap = new mapboxgl.Map({
    container: 'liveMap',
    style: getMapStyle(),
    center: DEFAULT_CENTER,
    zoom: 14,
    maxZoom: 18.5
  });

  liveMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

  liveMap.on('load', () => {
    const saved = localStorage.getItem('SAFEROUTE_BASEMAP') || 'dark';
    if (saved !== 'dark') setBasemapLayer(saved);
  });
}

function setupHeatmapLayers() {
  if (!map || map.getSource('safety-heat-source')) return;

  const points = [
    { lng: 77.2090, lat: 28.6139, weight: 0.8 },
    { lng: 77.2295, lat: 28.6304, weight: 0.95 },
    { lng: 77.1250, lat: 28.5562, weight: 0.4 },
    { lng: 77.2100, lat: 28.5244, weight: 0.7 },
    { lng: 77.2500, lat: 28.5800, weight: 0.6 },
    { lng: 77.1800, lat: 28.6500, weight: 0.85 },
    { lng: 77.0800, lat: 28.5900, weight: 0.88 },
    { lng: 77.3100, lat: 28.5355, weight: 0.5 }
  ];

  const geojson = {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { weight: p.weight }
    }))
  };

  map.addSource('safety-heat-source', {
    type: 'geojson',
    data: geojson
  });

  map.addLayer({
    id: 'safety-heat-layer',
    type: 'heatmap',
    source: 'safety-heat-source',
    maxzoom: 18,
    paint: {
      'heatmap-weight': ['get', 'weight'],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(33,102,172,0)',
        0.2, 'rgb(103,169,207)',
        0.4, 'rgb(209,229,240)',
        0.6, 'rgb(253,219,199)',
        0.8, 'rgb(239,138,98)',
        1, 'rgb(220,38,38)'
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 15, 26],
      'heatmap-opacity': 0.75
    }
  }, map.getLayer('waterway-label') ? 'waterway-label' : undefined);

  map.setLayoutProperty('safety-heat-layer', 'visibility', 'none');
}

function toggleHeatmap() {
  if (!map) return;
  heatmapActive = !heatmapActive;
  const btnText = document.getElementById('heatmapBtnText');
  const btn = document.getElementById('heatmapToggleBtn');

  if (heatmapActive) {
    if (map.getLayer('safety-heat-layer')) {
      map.setLayoutProperty('safety-heat-layer', 'visibility', 'visible');
    }
    if (btnText) btnText.textContent = 'Turn Off Safety Heatmap';
    if (btn) btn.classList.add('active');
    showToast('Safety risk heatmap activated on map');
  } else {
    if (map.getLayer('safety-heat-layer')) {
      map.setLayoutProperty('safety-heat-layer', 'visibility', 'none');
    }
    if (btnText) btnText.textContent = 'Turn On Safety Heatmap';
    if (btn) btn.classList.remove('active');
    showToast('Safety heatmap disabled');
  }
}

async function loadSafeHavenMapPins() {
  if (!map) return;
  safeHavenMarkers.forEach(m => m.remove());
  safeHavenMarkers = [];

  const havens = [
    { name: "CP Police Assistance & 24/7 Booth", lat: 28.6315, lng: 77.2167, type: "police" },
    { name: "RML Hospital 24/7 Emergency", lat: 28.6247, lng: 77.2023, type: "hospital" },
    { name: "AIIMS Trauma Centre Safe Zone", lat: 28.5672, lng: 77.2100, type: "hospital" },
    { name: "Hauz Khas Police Station", lat: 28.5494, lng: 77.2001, type: "police" },
    { name: "Rajiv Chowk Metro Security", lat: 28.6328, lng: 77.2195, type: "transit_hub" },
    { name: "Apollo 24/7 Pharmacy Safe Haven", lat: 28.5726, lng: 77.2215, type: "pharmacy" }
  ];

  havens.forEach(h => {
    const el = document.createElement('div');
    el.className = 'safe-haven-pin';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = h.type === 'police' ? '#38bdf8' : (h.type === 'hospital' ? '#ef4444' : '#10b981');
    el.style.border = '2px solid #ffffff';
    el.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    el.style.cursor = 'pointer';
    el.title = h.name;

    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
      <div style="color: #020617; font-family: Inter, sans-serif; padding: 4px;">
        <b style="font-size: 13px;">🛡️ ${h.name}</b>
        <div style="font-size: 11px; color: #475569; margin-top: 4px;">24/7 Safe Haven Checkpoint</div>
      </div>
    `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([h.lng, h.lat])
      .setPopup(popup)
      .addTo(map);

    safeHavenMarkers.push(marker);
  });
}

let originMarker = null;
let destMarker = null;

function clearRoutes() {
  if (!map) return;

  // 1. Remove all corridor layers first
  routeSources.forEach(id => {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch (e) {}
  });

  for (let i = 0; i < 10; i++) {
    try { if (map.getLayer(`route-${i}-casing`)) map.removeLayer(`route-${i}-casing`); } catch (e) {}
    try { if (map.getLayer(`route-${i}`)) map.removeLayer(`route-${i}`); } catch (e) {}
  }

  // 2. Remove all corridor sources once layers are cleared
  routeSources.forEach(id => {
    try {
      if (map.getSource(id)) map.removeSource(id);
    } catch (e) {}
  });

  for (let i = 0; i < 10; i++) {
    try { if (map.getSource(`route-${i}`)) map.removeSource(`route-${i}`); } catch (e) {}
  }

  routeSources = [];

  if (originMarker) {
    originMarker.remove();
    originMarker = null;
  }
  if (destMarker) {
    destMarker.remove();
    destMarker = null;
  }
}

function setJourneyEndpoints(startCoords, endCoords, originText, destText) {
  if (!map || !startCoords || !endCoords) return;

  if (originMarker) originMarker.remove();
  if (destMarker) destMarker.remove();

  // 1. Origin Marker (Emerald Pulse Pin)
  const originEl = document.createElement('div');
  originEl.className = 'origin-pin';
  originEl.style.width = '24px';
  originEl.style.height = '24px';
  originEl.style.borderRadius = '50%';
  originEl.style.backgroundColor = '#10b981';
  originEl.style.border = '3px solid #ffffff';
  originEl.style.boxShadow = '0 0 14px rgba(16, 185, 129, 0.9)';
  originEl.style.cursor = 'pointer';

  const originPopup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
    <div style="color: #020617; font-family: Inter, sans-serif; padding: 4px;">
      <b style="font-size: 13px; color: #059669;">🟢 Journey Origin</b>
      <div style="font-size: 11px; color: #475569; margin-top: 4px;">${escapeHtml(originText || 'Current Location')}</div>
    </div>
  `);

  originMarker = new mapboxgl.Marker(originEl)
    .setLngLat([startCoords[1], startCoords[0]])
    .setPopup(originPopup)
    .addTo(map);

  // 2. Destination Marker (Red Flag Pin)
  const destEl = document.createElement('div');
  destEl.className = 'dest-pin';
  destEl.style.width = '24px';
  destEl.style.height = '24px';
  destEl.style.borderRadius = '50%';
  destEl.style.backgroundColor = '#ef4444';
  destEl.style.border = '3px solid #ffffff';
  destEl.style.boxShadow = '0 0 14px rgba(239, 68, 68, 0.9)';
  destEl.style.cursor = 'pointer';

  const destPopup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
    <div style="color: #020617; font-family: Inter, sans-serif; padding: 4px;">
      <b style="font-size: 13px; color: #dc2626;">🎯 Journey Destination</b>
      <div style="font-size: 11px; color: #475569; margin-top: 4px;">${escapeHtml(destText || 'Selected Destination')}</div>
    </div>
  `);

  destMarker = new mapboxgl.Marker(destEl)
    .setLngLat([endCoords[1], endCoords[0]])
    .setPopup(destPopup)
    .addTo(map);
}

async function geocode(query) {
  if (hasValidMapboxToken()) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&limit=1`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.features && data.features.length) {
        const [lng, lat] = data.features[0].center;
        return [lat, lng];
      }
    } catch {}
  }

  // Free OpenStreetMap Nominatim geocoding fallback (zero API key required)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const resp = await fetch(nomUrl, { headers: { 'Accept-Language': 'en' } });
    const data = await resp.json();
    if (data && data.length) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
  } catch {}

  throw new Error(`Location not found: "${query}"`);
}
