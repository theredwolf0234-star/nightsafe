/**
 * SafeRoute.AI - Live Journey Guard
 * Real-time GPS tracking, simulated night journey tester, and hazard anomaly monitoring.
 */

let watchId = null;
let liveMarker = null;
let currentPos = null;
let gpsUpdateCount = 0;
let simulationInterval = null;

function startTracking() {
  if (!navigator.geolocation) {
    showToast('GPS unavailable on this device/browser', 'error');
    return;
  }

  initLiveMap();
  if (watchId !== null) return;

  gpsUpdateCount = 0;
  const statusEl = document.getElementById('gpsStatus');
  if (statusEl) {
    statusEl.textContent = 'Active';
    statusEl.style.color = '#10b981';
  }

  addSafetyFeed('🛰️ Live GPS night travel guard activated');

  watchId = navigator.geolocation.watchPosition(
    async position => {
      gpsUpdateCount++;
      const { latitude, longitude, accuracy, speed } = position.coords;
      currentPos = [latitude, longitude];

      updateTelemetry(latitude, longitude, gpsUpdateCount, accuracy, speed);
      updateLiveMarker(latitude, longitude);

      // AI Risk Engine real-time anomaly check
      if (window.riskClient) {
        try {
          const check = await window.riskClient.assessPointSafety(latitude, longitude);
          if (check.danger_zone) {
            addSafetyFeed(`⚠️ Caution: Approaching known low-light or incident cluster (Score: ${check.safety_score}%)`);
          }
        } catch {}
      }
    },
    err => {
      showToast(`GPS update warning: ${err.message}`, 'error');
      stopTracking();
    },
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 }
  );
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (simulationInterval !== null) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }

  const statusEl = document.getElementById('gpsStatus');
  if (statusEl) {
    statusEl.textContent = 'Stopped';
    statusEl.style.color = '#94a3b8';
  }
  addSafetyFeed('⏹️ GPS monitoring stopped');
}

function updateTelemetry(lat, lng, count, accuracy, speed) {
  const countEl = document.getElementById('gpsCount');
  const coordsEl = document.getElementById('coords');
  if (countEl) countEl.textContent = count;
  if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function updateLiveMarker(lat, lng) {
  if (!liveMap) return;

  if (!liveMarker) {
    const el = document.createElement('div');
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#ef4444';
    el.style.border = '3px solid #ffffff';
    el.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.8)';

    liveMarker = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup().setHTML('<b>Current Live Position</b>'))
      .addTo(liveMap);
  } else {
    liveMarker.setLngLat([lng, lat]);
  }

  liveMap.flyTo({ center: [lng, lat], zoom: 15.5 });
}

function addSafetyFeed(msg) {
  const feed = document.getElementById('feed');
  if (!feed) return;
  const d = document.createElement('div');
  d.className = 'card';
  d.style.padding = '0.55rem 0.85rem';
  d.style.fontSize = '0.8rem';
  d.style.marginBottom = '0.45rem';
  d.style.borderRadius = '8px';
  d.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  feed.prepend(d);
}

function shareCurrentLocation() {
  if (!currentPos) {
    showToast('Start GPS tracking or detect location first', 'error');
    return;
  }
  const url = `https://www.google.com/maps?q=${currentPos[0]},${currentPos[1]}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    showToast('📍 Live Google Maps link copied to clipboard!');
  } else {
    prompt('Copy your live location link:', url);
  }
}

/**
 * Interactive Simulation Mode: Allows testing the Live Journey Guard demo
 * without requiring real physical outdoor motion.
 */
function startSimulatedNightWalk() {
  initLiveMap();
  stopTracking();

  const simWaypoints = [
    { lat: 28.6328, lng: 77.2195, note: "Departed Rajiv Chowk Station (Lit Area)" },
    { lat: 28.6300, lng: 77.2180, note: "Entering Inner Circle (High Streetlights)" },
    { lat: 28.6270, lng: 77.2150, note: "Passed Police Checkpoint (Safe Haven)" },
    { lat: 28.6240, lng: 77.2110, note: "Approaching Outer Radial (Moderate Traffic)" },
    { lat: 28.6200, lng: 77.2080, note: "Arrived Safely at Destination" }
  ];

  let step = 0;
  const statusEl = document.getElementById('gpsStatus');
  if (statusEl) {
    statusEl.textContent = 'Simulating Walk';
    statusEl.style.color = '#38bdf8';
  }

  addSafetyFeed('🧪 Demonstration: Simulated Night Walk Started');

  simulationInterval = setInterval(() => {
    if (step >= simWaypoints.length) {
      clearInterval(simulationInterval);
      simulationInterval = null;
      addSafetyFeed('🏁 Demonstration journey completed safely!');
      showToast('Simulated night walk complete');
      return;
    }

    const pt = simWaypoints[step];
    currentPos = [pt.lat, pt.lng];
    gpsUpdateCount++;

    updateTelemetry(pt.lat, pt.lng, gpsUpdateCount, 5, 1.2);
    updateLiveMarker(pt.lat, pt.lng);
    addSafetyFeed(`📍 ${pt.note}`);

    step++;
  }, 2500);
}
