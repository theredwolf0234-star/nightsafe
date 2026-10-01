/**
 * SafeRoute.AI - Map Management & Geo-Visualizer
 * Mapbox GL JS integrations, multi-route styling, safe haven markers, and safety heatmaps.
 */

// CARTO Dark Matter raster style fallback (Zero configuration, high-performance, dark night aesthetic)
const CARTO_DARK_STYLE = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      ],
      tileSize: 256,
      attribution: '&copy; CARTO &copy; OpenStreetMap contributors'
    }
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

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
  return CARTO_DARK_STYLE;
}

// Set initial Mapbox token if available or a dummy placeholder to avoid library startup exceptions
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

  if (hasValidMapboxToken()) {
    mapboxgl.accessToken = getMapboxToken();
  }

  map = new mapboxgl.Map({
    container: 'map',
    style: getMapStyle(),
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM
  });

  map.addControl(new mapboxgl.NavigationControl(), 'top-right');

  map.on('load', () => {
    setupHeatmapLayers();
    loadSafeHavenMapPins();
  });
}

function initLiveMap() {
  if (liveMap) {
    liveMap.resize();
    return;
  }

  const container = document.getElementById('liveMap');
  if (!container) return;

  if (hasValidMapboxToken()) {
    mapboxgl.accessToken = getMapboxToken();
  }

  liveMap = new mapboxgl.Map({
    container: 'liveMap',
    style: getMapStyle(),
    center: DEFAULT_CENTER,
    zoom: 13
  });

  liveMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
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

  const beforeLayer = map.getLayer('waterway-label') ? 'waterway-label' : undefined;

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
  }, beforeLayer);

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
    if (typeof showToast === 'function') showToast('Safety risk heatmap activated on map');
  } else {
    if (map.getLayer('safety-heat-layer')) {
      map.setLayoutProperty('safety-heat-layer', 'visibility', 'none');
    }
    if (btnText) btnText.textContent = 'Turn On Safety Heatmap';
    if (btn) btn.classList.remove('active');
    if (typeof showToast === 'function') showToast('Safety heatmap disabled');
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

function clearRoutes() {
  if (!map) return;
  routeSources.forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  });
  routeSources = [];
}

async function geocode(query) {
  // If valid Mapbox token is present, try Mapbox Geocoding API first
  if (hasValidMapboxToken()) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${getMapboxToken()}&limit=1`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.features && data.features.length) {
          const [lng, lat] = data.features[0].center;
          return [lat, lng];
        }
      }
    } catch (e) {
      console.warn('[SafeRoute.AI] Mapbox geocode fallback:', e);
    }
  }

  // OpenStreetMap Nominatim Free Geocoder Fallback
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const osmResp = await fetch(osmUrl);
    if (osmResp.ok) {
      const osmData = await osmResp.json();
      if (osmData && osmData.length > 0) {
        return [parseFloat(osmData[0].lat), parseFloat(osmData[0].lon)];
      }
    }
  } catch (err) {
    console.warn('[SafeRoute.AI] Nominatim geocode error:', err);
  }

  throw new Error(`Location not found: "${query}"`);
}
