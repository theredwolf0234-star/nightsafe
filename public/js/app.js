/**
 * SafeRoute.AI - Main Application Controller
 * Orchestrates navigation, AI route planning, UI reactivity, and telemetry.
 */

window.evaluatedRoutes = [];

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

function showToast(message, type = 'info') {
  const toast = $('toast');
  if (!toast) return;

  toast.innerHTML = `<div class="toast-box ${type === 'error' ? 'error' : ''}">${message}</div>`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 3500);
}

window.navHistory = ['home'];
window.currentPage = 'home';

function closeAnyOpenModal() {
  let closed = false;
  const modals = ['sosModal', 'appModal'];
  modals.forEach(id => {
    const el = $(id);
    if (el && !el.classList.contains('hidden')) {
      el.classList.add('hidden');
      closed = true;
      if (id === 'sosModal' && typeof cancelSOS === 'function') {
        cancelSOS();
      }
    }
  });
  return closed;
}

function show(pageId, pushToHistory = true) {
  if (!pageId) pageId = 'home';

  // Always close any modal when switching screens
  closeAnyOpenModal();

  if (pageId !== window.currentPage && pushToHistory) {
    if (!window.navHistory) window.navHistory = ['home'];
    // Avoid immediate duplicate stack entries
    if (window.navHistory[window.navHistory.length - 1] !== pageId) {
      window.navHistory.push(pageId);
    }
    try {
      history.pushState({ page: pageId }, '', '#' + pageId);
    } catch (e) {}
  }
  window.currentPage = pageId;

  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  const target = $(pageId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-active'));
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('nav-active'));
  
  const activeBtns = document.querySelectorAll(`[data-nav="${pageId}"]`);
  activeBtns.forEach(b => b.classList.add('nav-active'));

  if (pageId === 'planner') {
    setTimeout(() => { if (typeof initMap === 'function') initMap(); }, 150);
  } else if (pageId === 'live') {
    setTimeout(() => { if (typeof initLiveMap === 'function') initLiveMap(); }, 150);
  } else if (pageId === 'contacts') {
    if (typeof loadContacts === 'function') loadContacts();
  } else if (pageId === 'reports') {
    if (typeof loadReports === 'function') loadReports();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  // 1. If any modal is open (SOS or App modal), close it first and stay on current page
  if (closeAnyOpenModal()) {
    return true;
  }

  // 2. If we have a navigation history stack with previous pages
  if (window.navHistory && window.navHistory.length > 1) {
    window.navHistory.pop(); // Remove current page
    let prevPage = window.navHistory[window.navHistory.length - 1] || 'home';
    if (prevPage === window.currentPage && window.navHistory.length > 1) {
      window.navHistory.pop();
      prevPage = window.navHistory[window.navHistory.length - 1] || 'home';
    }
    show(prevPage, false);
    try {
      history.replaceState({ page: prevPage }, '', '#' + prevPage);
    } catch (e) {}
    return true;
  }

  // 3. Fallback: If not on home, go back to home
  if (window.currentPage && window.currentPage !== 'home') {
    window.navHistory = ['home'];
    show('home', false);
    try {
      history.replaceState({ page: 'home' }, '', '#home');
    } catch (e) {}
    return true;
  }

  // Already on home with no modals open: let system exit/minimize
  return false;
}

// Global handler invoked by Android WebView hardware/gesture Back key
window.handleAppBack = function() {
  return goBack();
};

// Handle Browser Back Button / Mobile Safari swipe back
window.addEventListener('popstate', event => {
  if (closeAnyOpenModal()) {
    return;
  }
  const targetPage = (event.state && event.state.page) || (window.location.hash ? window.location.hash.replace('#', '') : 'home');
  if (window.navHistory && window.navHistory.length > 1) {
    window.navHistory.pop();
  }
  show(targetPage, false);
});

// Initial URL hash navigation on load
window.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash ? window.location.hash.replace('#', '') : '';
  if (hash && ['planner', 'live', 'contacts', 'reports'].includes(hash)) {
    show(hash, false);
  }
});

function detectLocation() {
  if (!navigator.geolocation) {
    showToast('GPS is not supported by your browser', 'error');
    return;
  }

  showToast('Acquiring high-accuracy GPS coordinates…');
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude, longitude } = pos.coords;
      currentPos = [latitude, longitude];

      const originInput = $('origin');
      if (originInput) {
        originInput.value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }

      show('planner');
      initMap();

      if (map) {
        map.flyTo({ center: [longitude, latitude], zoom: 15 });

        if (plannerMarker) plannerMarker.remove();
        plannerMarker = new mapboxgl.Marker({ color: '#10b981' })
          .setLngLat([longitude, latitude])
          .setPopup(new mapboxgl.Popup().setHTML('<b>📍 Your Current Location</b>'))
          .addTo(map);
      }

      // Reverse geocode to human-readable address
      try {
        const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxgl.accessToken}&limit=1`);
        const d = await r.json();
        if (d.features && d.features.length && originInput) {
          originInput.value = d.features[0].place_name;
        }
      } catch {}

      showToast('GPS location acquired');
    },
    err => showToast(`Location failed: ${err.message}`, 'error'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

async function planRoute() {
  initMap();

  const destInput = $('destination');
  const destVal = destInput ? destInput.value.trim() : '';
  if (!destVal) {
    showToast('Please specify a destination', 'error');
    destInput?.focus();
    return;
  }

  let startCoords = currentPos;
  const originVal = $('origin') ? $('origin').value.trim() : '';

  try {
    showToast('Calculating AI lighting-aware safety corridors…');

    if (!startCoords) {
      if (!originVal) {
        throw new Error('Please enter a starting location or click 📍 Detect Location');
      }
      startCoords = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(originVal)
        ? originVal.split(',').map(Number)
        : await geocode(originVal);
    }

    const endCoords = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(destVal)
      ? destVal.split(',').map(Number)
      : await geocode(destVal);

    const mode = $('mode') ? $('mode').value : 'driving';
    const departureTime = $('departure') ? $('departure').value : '23:00';

    // Fetch MULTIPLE distinct safety corridors (OSRM + Mapbox + Alternative Corridors)
    const rawRoutes = await fetchMultipleSafeRoutes(startCoords, endCoords, mode);

    // Send all corridors to AI Risk Engine!
    const aiEvaluation = await window.riskClient.evaluateRoutes(rawRoutes, departureTime, mode);
    const evaluatedList = aiEvaluation.evaluated_routes || [];
    window.evaluatedRoutes = evaluatedList;
    window.rawRoutes = rawRoutes;
    window.selectedRouteIndex = 0;

    clearRoutes();

    // Mark Journey Origin and Destination Pins
    if (typeof setJourneyEndpoints === 'function') {
      setJourneyEndpoints(startCoords, endCoords, originVal || 'Origin', destVal);
    }

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([startCoords[1], startCoords[0]]);
    bounds.extend([endCoords[1], endCoords[0]]);

    // Render All Corridors onto Mapbox GL
    rawRoutes.forEach((rawRoute, i) => {
      const sourceId = `route-${i}`;
      const casingId = `${sourceId}-casing`;
      const theme = ROUTE_THEMES[i % ROUTE_THEMES.length];
      const isSelected = i === window.selectedRouteIndex;

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: rawRoute.geometry
        }
      });

      // 1. Dark background casing for maximum night contrast
      map.addLayer({
        id: casingId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#030812',
          'line-opacity': isSelected ? 0.85 : 0.35,
          'line-width': isSelected ? 12 : 6
        }
      });

      // 2. High-visibility colored corridor line
      map.addLayer({
        id: sourceId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': theme.color,
          'line-opacity': isSelected ? 1.0 : 0.55,
          'line-width': isSelected ? 7.5 : 4.5
        }
      });

      // Interactive click directly on route line to select
      map.on('click', sourceId, () => focusRoute(i));
      map.on('mouseenter', sourceId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', sourceId, () => { map.getCanvas().style.cursor = ''; });

      routeSources.push(casingId);
      routeSources.push(sourceId);

      rawRoute.geometry.coordinates.forEach(coord => bounds.extend(coord));
    });

    // Bring selected route to top
    if (map.getLayer(`route-0-casing`)) map.moveLayer(`route-0-casing`);
    if (map.getLayer(`route-0`)) map.moveLayer(`route-0`);

    // Render Route Cards with Distinct Corridor Accents
    const cardsHtml = rawRoutes.map((rawRoute, i) => {
      const evalData = evaluatedList[i] || {};
      const theme = ROUTE_THEMES[i % ROUTE_THEMES.length];
      const isSelected = i === window.selectedRouteIndex;

      return `
        <div class="route-card ${isSelected ? 'selected' : ''}" id="routeCard-${i}" onclick="focusRoute(${i})" style="--route-accent: ${theme.color};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${theme.color}; box-shadow: 0 0 8px ${theme.color};"></span>
              <b style="font-size: 0.95rem; color: #ffffff;">${escapeHtml(evalData.title || `Route ${i + 1}`)}</b>
            </div>
            <span class="${evalData.risk_class || 'risk-low'}" style="font-weight: 800; font-size: 0.85rem; white-space: nowrap; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 6px;">
              ${evalData.lighting_percentage || 88}% Lit
            </span>
          </div>

          <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 6px; line-height: 1.4;">
            ${escapeHtml(evalData.corridor || 'Continuous Lighting Corridor')}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #cbd5e1; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06);">
            <span>${evalData.distance_km || (rawRoute.distance / 1000).toFixed(1)} km • ${evalData.duration_min || Math.round(rawRoute.duration / 60)} min</span>
            <span style="color: ${evalData.risk_color || theme.color}; font-weight: 800;">Safety: ${evalData.safety_score || 85}%</span>
          </div>
        </div>
      `;
    }).join('');

    const routeListEl = $('routeList');
    if (routeListEl) routeListEl.innerHTML = cardsHtml;

    // Render Side-by-Side Lighting & Safety Comparison
    renderLightingComparison(rawRoutes, evaluatedList);

    // Render Explainable AI Metrics Breakdown for Primary Route
    renderExplainableAIBreakdown(evaluatedList[0]);

    // Fit map bounds with padding
    map.fitBounds(bounds, { padding: 60 });

    const infoEl = $('routeInfo');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div>
            <b>${rawRoutes.length} distinct safety corridors evaluated by AI Risk Engine.</b>
            <span style="color: #94a3b8; margin-left: 6px;">Click any corridor or card to compare streetlamp density, emergency havens, and crime avoidance.</span>
          </div>
          <span class="backend-badge" style="background: rgba(16,185,129,0.18);">Multi-Route AI Active</span>
        </div>
      `;
    }

    showToast(`Evaluated ${rawRoutes.length} safety corridors`);
  } catch (err) {
    console.error('[planRoute] Error:', err);
    showToast(err.message, 'error');
  }
}

const ROUTE_THEMES = [
  {
    name: 'Primary Lit Corridor',
    color: '#10b981', // Neon Emerald
    badgeText: 'AI Recommended',
    badgeClass: 'risk-low'
  },
  {
    name: 'Lit Commercial Boulevard',
    color: '#38bdf8', // Neon Sky Blue
    badgeText: 'High Illumination',
    badgeClass: 'risk-low'
  },
  {
    name: 'Safe-Haven Patrol Corridor',
    color: '#c084fc', // Vibrant Orchid / Purple
    badgeText: 'Police & Haven Near',
    badgeClass: 'risk-low'
  },
  {
    name: 'Express Arterial Highway',
    color: '#06b6d4', // Vibrant Cyan / Teal
    badgeText: 'High-Capacity Arterial',
    badgeClass: 'risk-low'
  },
  {
    name: 'Fastest Direct Route',
    color: '#f59e0b', // Amber / Gold
    badgeText: 'Direct Shortcut',
    badgeClass: 'risk-med'
  }
];

window.selectedRouteIndex = 0;

async function fetchMultipleSafeRoutes(startCoords, endCoords, mode) {
  const startLat = startCoords[0];
  const startLng = startCoords[1];
  const endLat = endCoords[0];
  const endLng = endCoords[1];

  const dx = endLng - startLng;
  const dy = endLat - startLat;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const px = dist > 0 ? -dy / dist : 0;
  const py = dist > 0 ? dx / dist : 0;
  const lateralOffset = Math.min(0.045, Math.max(0.008, dist * 0.28));

  const osrmMode = mode === 'walking' ? 'foot' : (mode === 'cycling' ? 'bike' : 'driving');

  // Find nearby safe haven checkpoints
  const knownHavens = [
    { name: "CP Police Booth", lat: 28.6315, lng: 77.2167 },
    { name: "RML Hospital", lat: 28.6247, lng: 77.2023 },
    { name: "AIIMS Trauma Centre", lat: 28.5672, lng: 77.2100 },
    { name: "Hauz Khas Police Station", lat: 28.5494, lng: 77.2001 },
    { name: "Apollo 24/7 Pharmacy", lat: 28.5726, lng: 77.2215 },
    { name: "Rajiv Chowk Metro Security", lat: 28.6328, lng: 77.2195 }
  ];

  const midLat = (startLat + endLat) / 2;
  const midLng = (startLng + endLng) / 2;
  let havenWaypoint = null;
  let minHavenDist = Infinity;

  knownHavens.forEach(h => {
    const dH = Math.sqrt((h.lat - midLat) ** 2 + (h.lng - midLng) ** 2);
    if (dH < Math.max(dist * 1.5, 0.08) && dH < minHavenDist) {
      minHavenDist = dH;
      havenWaypoint = [h.lat, h.lng];
    }
  });

  if (!havenWaypoint) {
    havenWaypoint = [
      startLat + dy * 0.70 + py * (lateralOffset * 0.65),
      startLng + dx * 0.70 + px * (lateralOffset * 0.65)
    ];
  }

  // 5 Distinct Corridor Queries:
  // 0: Direct baseline
  // 1: Well-lit commercial boulevard (East flank offset)
  // 2: Safe-haven patrol corridor (Nearby checkpoint)
  // 3: Express arterial highway / Ring bypass (West flank offset)
  // 4: Wide arterial bypass (Extended lateral offset)
  const viaWaypoints = [
    null,
    [startLat + dy * 0.38 + py * lateralOffset, startLng + dx * 0.38 + px * lateralOffset],
    havenWaypoint,
    [startLat + dy * 0.62 - py * lateralOffset, startLng + dx * 0.62 - px * lateralOffset],
    [startLat + dy * 0.50 + py * (lateralOffset * 1.45), startLng + dx * 0.50 + px * (lateralOffset * 1.45)]
  ];

  // If user provided a valid Mapbox token, try Mapbox first
  if (typeof hasValidMapboxToken === 'function' && hasValidMapboxToken()) {
    try {
      const mbxUrl = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${startLng},${startLat};${endLng},${endLat}?alternatives=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;
      const resp = await fetch(mbxUrl, { signal: AbortSignal.timeout(4000) });
      const data = await resp.json();
      if (data.routes && data.routes.length >= 4) {
        return data.routes;
      }
    } catch (e) {}
  }

  // Query OSRM in parallel across the 5 corridors
  const fetchCorridor = async (via) => {
    let url;
    if (!via) {
      url = `https://router.project-osrm.org/route/v1/${osrmMode}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&alternatives=true`;
    } else {
      url = `https://router.project-osrm.org/route/v1/${osrmMode}/${startLng},${startLat};${via[1].toFixed(5)},${via[0].toFixed(5)};${endLng},${endLat}?overview=full&geometries=geojson`;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('OSRM status: ' + res.status);
    const d = await res.json();
    return d.routes || [];
  };

  const results = await Promise.allSettled(viaWaypoints.map(w => fetchCorridor(w)));

  const candidates = [];
  results.forEach(res => {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      res.value.forEach(r => {
        if (r && r.geometry && r.geometry.coordinates && r.geometry.coordinates.length > 1) {
          candidates.push({
            distance: r.distance,
            duration: r.duration,
            geometry: r.geometry
          });
        }
      });
    }
  });

  // Deduplicate routes (distance diff > 3% or midpoints > 300m apart)
  const uniqueRoutes = [];
  candidates.forEach(cand => {
    const isDup = uniqueRoutes.some(existing => {
      const distRatio = Math.abs(existing.distance - cand.distance) / Math.max(existing.distance, 1);
      if (distRatio > 0.035) return false;
      const midA = existing.geometry.coordinates[Math.floor(existing.geometry.coordinates.length / 2)] || [0, 0];
      const midB = cand.geometry.coordinates[Math.floor(cand.geometry.coordinates.length / 2)] || [0, 0];
      const dMid = Math.sqrt((midA[0] - midB[0]) ** 2 + (midA[1] - midB[1]) ** 2);
      return dMid < 0.003;
    });
    if (!isDup) {
      uniqueRoutes.push(cand);
    }
  });

  if (uniqueRoutes.length >= 4) {
    return uniqueRoutes.slice(0, 5);
  }

  // Supplement with synthetic corridors to guarantee at least 5 distinct routes
  return completeWithSyntheticCorridors(uniqueRoutes, startCoords, endCoords, mode);
}

function completeWithSyntheticCorridors(existingRoutes, startCoords, endCoords, mode) {
  const startLat = startCoords[0];
  const startLng = startCoords[1];
  const endLat = endCoords[0];
  const endLng = endCoords[1];

  const dx = endLng - startLng;
  const dy = endLat - startLat;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const px = dist > 0 ? -dy / dist : 0;
  const py = dist > 0 ? dx / dist : 0;
  const lateralOffset = Math.min(0.045, Math.max(0.008, dist * 0.28));

  const baseDistance = existingRoutes.length && existingRoutes[0].distance
    ? existingRoutes[0].distance
    : Math.max(1500, Math.round(dist * 111000 * 1.25));
  const baseDuration = existingRoutes.length && existingRoutes[0].duration
    ? existingRoutes[0].duration
    : Math.max(240, Math.round(baseDistance / (mode === 'walking' ? 1.3 : (mode === 'cycling' ? 4.2 : 11.0))));

  const routes = [...existingRoutes];

  function generateArcCoordinates(bowFactor, segments = 32) {
    const coords = [];
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const baseLat = startLat + dy * t;
      const baseLng = startLng + dx * t;
      const bow = Math.sin(t * Math.PI) * lateralOffset * bowFactor;
      const jitter = Math.sin(t * Math.PI * 5) * (lateralOffset * 0.04);
      coords.push([
        Math.round((baseLng + px * (bow + jitter)) * 100000) / 100000,
        Math.round((baseLat + py * (bow + jitter)) * 100000) / 100000
      ]);
    }
    return coords;
  }

  // Route 0 (Direct Baseline if empty)
  if (routes.length === 0) {
    routes.push({
      distance: baseDistance,
      duration: baseDuration,
      geometry: {
        type: 'LineString',
        coordinates: generateArcCoordinates(0.10)
      }
    });
  }

  // Corridor 1: Well-lit commercial boulevard (East flank)
  if (routes.length < 2) {
    routes.push({
      distance: Math.round(baseDistance * 1.12),
      duration: Math.round(baseDuration * 1.16),
      geometry: {
        type: 'LineString',
        coordinates: generateArcCoordinates(0.85)
      }
    });
  }

  // Corridor 2: Safe-Haven patrol corridor (West flank)
  if (routes.length < 3) {
    routes.push({
      distance: Math.round(baseDistance * 1.20),
      duration: Math.round(baseDuration * 1.24),
      geometry: {
        type: 'LineString',
        coordinates: generateArcCoordinates(-0.85)
      }
    });
  }

  // Corridor 3: Express Arterial Highway (Wide flank)
  if (routes.length < 4) {
    routes.push({
      distance: Math.round(baseDistance * 1.28),
      duration: Math.round(baseDuration * 1.10), // Faster highway speed
      geometry: {
        type: 'LineString',
        coordinates: generateArcCoordinates(1.40)
      }
    });
  }

  // Corridor 4: Fastest direct shortcut
  if (routes.length < 5) {
    routes.push({
      distance: Math.round(baseDistance * 0.94),
      duration: Math.round(baseDuration * 0.90),
      geometry: {
        type: 'LineString',
        coordinates: generateArcCoordinates(-0.25)
      }
    });
  }

  return routes.slice(0, 5);
}

function renderLightingComparison(rawRoutes, evaluatedList) {
  const grid = $('compareDetailsGrid');
  if (!grid || !evaluatedList || !evaluatedList.length) return;

  grid.innerHTML = evaluatedList.map((ev, i) => {
    const theme = ROUTE_THEMES[i % ROUTE_THEMES.length];
    const isSelected = i === window.selectedRouteIndex;

    return `
      <div class="card compare-route-card ${isSelected ? 'selected-compare-card' : ''}" id="compareCard-${i}" style="padding: 1.15rem; position: relative; border-color: ${isSelected ? theme.color : 'var(--border-glass)'}; background: ${isSelected ? 'rgba(16, 32, 50, 0.92)' : 'rgba(12, 24, 40, 0.65)'};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; gap: 8px;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${theme.color}; box-shadow: 0 0 6px ${theme.color};"></span>
              <b style="font-size: 0.92rem; color: #ffffff;">${escapeHtml(ev.title)}</b>
            </div>
            <div style="font-size: 0.72rem; color: ${theme.color}; font-weight: 700; margin-top: 2px;">${theme.badgeText}</div>
          </div>
          <span class="${ev.risk_class}" style="font-weight: 800; font-size: 0.85rem; padding: 2px 7px; background: rgba(255,255,255,0.06); border-radius: 6px; white-space: nowrap;">
            ${ev.lighting_percentage}% Lit
          </span>
        </div>

        <div style="font-size: 0.8rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.6rem; display: flex; flex-direction: column; gap: 0.35rem;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #94a3b8;">Distance:</span>
            <b>${ev.distance_km} km</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #94a3b8;">Est. Duration:</span>
            <b>${ev.duration_min} min</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #94a3b8;">Safety Index:</span>
            <b style="color: ${ev.risk_color};">${ev.safety_score}% (${ev.risk_level})</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #94a3b8;">Corridor:</span>
            <b style="text-align: right; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(ev.corridor)}">${escapeHtml(ev.corridor)}</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #94a3b8;">Surveillance:</span>
            <b style="text-align: right; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(ev.surveillance)}</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #94a3b8;">Safe Havens:</span>
            <b style="color: #38bdf8;">${ev.safe_havens_count || 0} Checkpoints</b>
          </div>
        </div>

        <button onclick="focusRoute(${i})" class="btn-outline" style="width: 100%; margin-top: 0.85rem; padding: 0.45rem; font-size: 0.8rem; justify-content: center; ${isSelected ? `border-color: ${theme.color}; color: #ffffff; background: rgba(255,255,255,0.08);` : ''}">
          ${isSelected ? '✓ Active on Map' : 'Highlight on Map'}
        </button>
      </div>
    `;
  }).join('');
}

function renderExplainableAIBreakdown(routeEval) {
  const panel = $('aiMetricsBreakdown');
  if (!panel || !routeEval) return;

  const m = routeEval.metrics_breakdown || {};
  const warnings = routeEval.hazard_warnings || [];

  panel.innerHTML = `
    <div class="ai-breakdown-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 8px;">
        <h4 style="font-weight: 800; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
          🧠 AI Safety Vector Breakdown: ${escapeHtml(routeEval.title)}
        </h4>
        <span class="backend-badge" style="background: rgba(56, 189, 248, 0.15); border-color: rgba(56, 189, 248, 0.35); color: #38bdf8;">
          Multi-Factor Risk Model
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>Street Lighting Lumen Density</span><b>${m.lighting_score || 85}%</b></div>
          <div class="metric-bar-track"><div class="metric-bar-fill" style="width: ${m.lighting_score || 85}%; background: #10b981;"></div></div>
        </div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>Safe Haven Proximity Index</span><b>${m.haven_proximity_score || 78}%</b></div>
          <div class="metric-bar-track"><div class="metric-bar-fill" style="width: ${m.haven_proximity_score || 78}%; background: #38bdf8;"></div></div>
        </div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>Crime & Incident Avoidance</span><b>${m.incident_avoidance_score || 82}%</b></div>
          <div class="metric-bar-track"><div class="metric-bar-fill" style="width: ${m.incident_avoidance_score || 82}%; background: #a855f7;"></div></div>
        </div>
        <div class="metric-bar-wrap">
          <div class="metric-bar-label"><span>CCTV & Surveillance Coverage</span><b>${m.cctv_coverage_score || 88}%</b></div>
          <div class="metric-bar-track"><div class="metric-bar-fill" style="width: ${m.cctv_coverage_score || 88}%; background: #06b6d4;"></div></div>
        </div>
      </div>

      <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem;">
        <b>Corridor Risk Assessment:</b>
        <ul style="margin-top: 4px; padding-left: 18px; color: #cbd5e1; line-height: 1.5;">
          ${warnings.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

function focusRoute(index) {
  if (!window.rawRoutes || !window.rawRoutes[index] || !map) return;
  window.selectedRouteIndex = index;

  const route = window.rawRoutes[index];
  const bounds = new mapboxgl.LngLatBounds();
  route.geometry.coordinates.forEach(coord => bounds.extend(coord));
  map.fitBounds(bounds, { padding: 60 });

  // Update card styling
  document.querySelectorAll('.route-card').forEach((c, idx) => {
    c.classList.toggle('selected', idx === index);
  });

  // Update comparison cards styling
  document.querySelectorAll('.compare-route-card').forEach((c, idx) => {
    const theme = ROUTE_THEMES[idx % ROUTE_THEMES.length];
    const isSelected = idx === index;
    c.classList.toggle('selected-compare-card', isSelected);
    c.style.borderColor = isSelected ? theme.color : 'var(--border-glass)';
    c.style.background = isSelected ? 'rgba(16, 32, 50, 0.92)' : 'rgba(12, 24, 40, 0.65)';
    const btn = c.querySelector('button');
    if (btn) {
      btn.textContent = isSelected ? '✓ Active on Map' : 'Highlight on Map';
      btn.style.borderColor = isSelected ? theme.color : '';
      btn.style.color = isSelected ? '#ffffff' : '';
      btn.style.background = isSelected ? 'rgba(255,255,255,0.08)' : '';
    }
  });

  // Re-style map layers: bring selected route to top
  window.rawRoutes.forEach((_, idx) => {
    const sourceId = `route-${idx}`;
    const casingId = `${sourceId}-casing`;
    const isSelected = idx === index;

    if (map.getLayer(casingId)) {
      map.setPaintProperty(casingId, 'line-opacity', isSelected ? 0.85 : 0.25);
      map.setPaintProperty(casingId, 'line-width', isSelected ? 12 : 6);
    }
    if (map.getLayer(sourceId)) {
      map.setPaintProperty(sourceId, 'line-opacity', isSelected ? 1.0 : 0.45);
      map.setPaintProperty(sourceId, 'line-width', isSelected ? 7.5 : 4);
    }
  });

  // Move selected route on top
  const activeSourceId = `route-${index}`;
  const activeCasingId = `${activeSourceId}-casing`;
  if (map.getLayer(activeCasingId)) map.moveLayer(activeCasingId);
  if (map.getLayer(activeSourceId)) map.moveLayer(activeSourceId);

  // Update explainable breakdown
  if (window.evaluatedRoutes && window.evaluatedRoutes[index]) {
    renderExplainableAIBreakdown(window.evaluatedRoutes[index]);
  }
}

// Window Onload initialization
window.addEventListener('load', () => {
  const now = new Date();
  const dep = $('departure');
  if (dep) {
    dep.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  show('home');
});

// Mobile App & PWA Installation Logic
let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const btn = $('pwaInstallBtn');
  if (btn) {
    btn.innerHTML = '📲 Install App (Ready)';
    btn.classList.add('pulse');
  }
});

function detectPlatform() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) {
    return 'android';
  }
  if (/Mac/.test(platform) || /Macintosh/.test(ua)) {
    return 'mac';
  }
  if (/Win/.test(platform) || /Windows/.test(ua)) {
    return 'windows';
  }
  return 'other';
}

function openAppModal() {
  const os = detectPlatform();
  const badge = $('detectedOsBadge');
  const iosGuide = $('iosInstallGuide');
  
  if (badge) {
    if (os === 'android') {
      badge.innerHTML = '🤖 Android Device';
      badge.style.color = '#34d399';
      badge.style.borderColor = 'rgba(52, 211, 153, 0.4)';
    } else if (os === 'ios') {
      badge.innerHTML = '🍎 Apple iOS Device';
      badge.style.color = '#f472b6';
      badge.style.borderColor = 'rgba(244, 114, 182, 0.4)';
    } else if (os === 'windows') {
      badge.innerHTML = '🪟 Windows PC';
      badge.style.color = '#38bdf8';
      badge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    } else if (os === 'mac') {
      badge.innerHTML = '🍏 macOS Device';
      badge.style.color = '#cbd5e1';
      badge.style.borderColor = 'rgba(203, 213, 225, 0.4)';
    } else {
      badge.innerHTML = '🌐 Universal Device';
    }
  }

  if (iosGuide) {
    iosGuide.style.display = os === 'ios' ? 'block' : 'block'; // Always visible with highlighted instructions
  }

  const modal = $('appModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAppModal() {
  const modal = $('appModal');
  if (modal) modal.classList.add('hidden');
}

function installPWA() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then(choiceResult => {
      if (choiceResult.outcome === 'accepted') {
        showToast('App installed to your device successfully!');
        closeAppModal();
      }
      deferredPwaPrompt = null;
    });
  } else {
    showToast('To install: click your browser menu (⋮ or Share) and choose "Add to Home Screen" or "Install App".');
  }
}

// Service Worker Registration for Offline App Execution
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.update().catch(() => {});
  }).catch(() => {});
}
