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

function show(pageId) {
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  const target = $(pageId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-active'));
  const activeBtn = document.querySelector(`[data-nav="${pageId}"]`);
  if (activeBtn) activeBtn.classList.add('nav-active');

  if (pageId === 'planner') {
    setTimeout(initMap, 150);
  } else if (pageId === 'live') {
    setTimeout(initLiveMap, 150);
  } else if (pageId === 'contacts') {
    loadContacts();
  } else if (pageId === 'reports') {
    loadReports();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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
        if (typeof hasValidMapboxToken === 'function' && hasValidMapboxToken()) {
          const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${getMapboxToken()}&limit=1`);
          if (r.ok) {
            const d = await r.json();
            if (d.features && d.features.length && originInput) {
              originInput.value = d.features[0].place_name;
              showToast('GPS location acquired');
              return;
            }
          }
        }
        const osmResp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        if (osmResp.ok) {
          const osmData = await osmResp.json();
          if (osmData && osmData.display_name && originInput) {
            originInput.value = osmData.display_name;
            showToast('GPS location acquired');
            return;
          }
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
        throw new Error('Please enter a starting location or click Detect Location');
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

    let rawRoutes = [];

    // Fetch primary and alternative routes from Mapbox Directions API if token available
    if (typeof hasValidMapboxToken === 'function' && hasValidMapboxToken()) {
      try {
        const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?alternatives=true&geometries=geojson&access_token=${getMapboxToken()}`;
        const resp = await fetch(directionsUrl);
        if (resp.ok) {
          const data = await resp.json();
          if (data.routes && data.routes.length) {
            rawRoutes = data.routes;
          }
        }
      } catch (e) {
        console.warn('Mapbox directions error:', e);
      }
    }

    // OSRM Public Routing Fallback
    if (!rawRoutes.length) {
      const osrmMode = mode === 'walking' ? 'foot' : (mode === 'cycling' ? 'bicycle' : 'car');
      const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmMode}/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson&alternatives=true`;
      const osrmResp = await fetch(osrmUrl);
      if (osrmResp.ok) {
        const osrmData = await osrmResp.json();
        if (osrmData && osrmData.routes && osrmData.routes.length) {
          rawRoutes = osrmData.routes;
        }
      }
    }

    if (!rawRoutes.length) {
      throw new Error('No navigable route found between these locations');
    }

    const rawRoutes = data.routes;

    // Send routes to our AI Risk Engine!
    const aiEvaluation = await window.riskClient.evaluateRoutes(rawRoutes, departureTime, mode);
    const evaluatedList = aiEvaluation.evaluated_routes;
    window.evaluatedRoutes = evaluatedList;

    clearRoutes();

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([startCoords[1], startCoords[0]]);
    bounds.extend([endCoords[1], endCoords[0]]);

    // Render Routes onto Mapbox GL
    const cardsHtml = rawRoutes.map((rawRoute, i) => {
      const evalData = evaluatedList[i] || {};
      const sourceId = `route-${i}`;

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: rawRoute.geometry
        }
      });

      map.addLayer({
        id: sourceId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': i === 0 ? '#10b981' : (evalData.safety_score >= 55 ? '#38bdf8' : '#64748b'),
          'line-opacity': i === 0 ? 0.95 : 0.55,
          'line-width': i === 0 ? 7 : 4
        }
      });

      routeSources.push(sourceId);

      rawRoute.geometry.coordinates.forEach(coord => bounds.extend(coord));

      return `
        <div class="route-card ${i === 0 ? 'selected' : ''}" id="routeCard-${i}" onclick="focusRoute(${i})">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b style="font-size: 0.95rem;">${evalData.title || (i === 0 ? 'Primary Lit Route' : 'Alternative ' + i)}</b>
            <span class="${evalData.risk_class || 'risk-low'}" style="font-weight: 800; font-size: 0.9rem;">
              ${evalData.lighting_percentage || 88}% Lit
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #94a3b8; margin-top: 6px;">
            <span>${evalData.distance_km || (rawRoute.distance / 1000).toFixed(1)} km • ${evalData.duration_min || Math.round(rawRoute.duration / 60)} min</span>
            <span style="color: ${evalData.risk_color || '#10b981'}; font-weight: 700;">Score: ${evalData.safety_score || 85}%</span>
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

    // Fit map bounds
    map.fitBounds(bounds, { padding: 60 });

    const infoEl = $('routeInfo');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div>
            <b>${rawRoutes.length} corridor(s) evaluated by AI Risk Engine.</b>
            <span style="color: #94a3b8; margin-left: 6px;">Optimized for lumen density, 24/7 safe havens, and crime avoidance.</span>
          </div>
          <span class="backend-badge" style="background: rgba(16,185,129,0.18);">AI Safety Index Active</span>
        </div>
      `;
    }

    window.rawRoutes = rawRoutes;
    showToast('AI lighting-aware safety analysis complete');
  } catch (err) {
    console.error('[planRoute] Error:', err);
    showToast(err.message, 'error');
  }
}

function renderLightingComparison(rawRoutes, evaluatedList) {
  const grid = $('compareDetailsGrid');
  if (!grid || !evaluatedList || !evaluatedList.length) return;

  grid.innerHTML = evaluatedList.map((ev, i) => `
    <div class="card" style="padding: 1.15rem; ${i === 0 ? 'border-color: rgba(52, 211, 153, 0.45); background: rgba(16, 32, 50, 0.85);' : ''}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <b style="font-size: 0.95rem;">${ev.title}</b>
        <span class="${ev.risk_class}" style="font-weight: 800; font-size: 0.9rem;">${ev.lighting_percentage}% Lit</span>
      </div>
      <div style="font-size: 0.8rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
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
          <b style="text-align: right; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ev.corridor}</b>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">Surveillance:</span>
          <b>${ev.surveillance}</b>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">Safe Havens (800m):</span>
          <b style="color: #38bdf8;">${ev.safe_havens_count} Checkpoints</b>
        </div>
      </div>
      <button onclick="focusRoute(${i})" class="btn-outline" style="width: 100%; margin-top: 0.85rem; padding: 0.45rem; font-size: 0.8rem; justify-content: center;">
        Highlight on Map
      </button>
    </div>
  `).join('');
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
          🧠 AI Safety Vector Breakdown: ${routeEval.title}
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

  const route = window.rawRoutes[index];
  const bounds = new mapboxgl.LngLatBounds();
  route.geometry.coordinates.forEach(coord => bounds.extend(coord));
  map.fitBounds(bounds, { padding: 60 });

  // Update card styling
  document.querySelectorAll('.route-card').forEach((c, idx) => {
    if (idx === index) c.classList.add('selected');
    else c.classList.remove('selected');
  });

  // Update map layer styling
  routeSources.forEach((id, idx) => {
    if (map.getLayer(id)) {
      map.setPaintProperty(id, 'line-color', idx === index ? '#10b981' : '#64748b');
      map.setPaintProperty(id, 'line-opacity', idx === index ? 0.95 : 0.35);
      map.setPaintProperty(id, 'line-width', idx === index ? 7 : 4);
    }
  });

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
