/**
 * SafeRoute.AI - Incident & SOS Reports Manager
 */

const INCIDENTS_CACHE_KEY = 'saferoute_reports';

async function loadReports() {
  const container = document.getElementById('reportsList');
  if (!container) return;

  let reports = [];

  // 1. Fetch from backend
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      const resp = await fetch(`${window.riskClient.apiBase}/api/incidents`);
      if (resp.ok) {
        const data = await resp.json();
        reports = data.incidents || [];
        localStorage.setItem(INCIDENTS_CACHE_KEY, JSON.stringify(reports));
      }
    } catch {}
  }

  // 2. Fallback to local storage
  if (!reports.length) {
    reports = JSON.parse(localStorage.getItem(INCIDENTS_CACHE_KEY) || '[]');
  }

  renderReports(reports);
}

function renderReports(reports) {
  const container = document.getElementById('reportsList');
  if (!container) return;

  if (!reports.length) {
    container.innerHTML = '<p class="text-slate-500 text-sm">No SOS or incident reports logged yet.</p>';
    return;
  }

  container.innerHTML = reports.map((r, i) => `
    <div class="card" style="padding: 1rem; border-left: 4px solid ${r.type.includes('SOS') ? '#ef4444' : '#f59e0b'}; margin-bottom: 0.85rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 11px; font-weight: 800; color: ${r.type.includes('SOS') ? '#f87171' : '#fbbf24'}; background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 6px;">
            ${escapeHtml(r.type)}
          </span>
          <span style="font-size: 11px; color: #94a3b8; margin-left: 8px;">${escapeHtml(r.id || 'INC-' + i)}</span>
        </div>
        <button onclick="deleteReport('${r.id || i}')" style="background: transparent; border: none; color: #f87171; cursor: pointer; font-size: 0.8rem;">Delete</button>
      </div>
      <p style="font-size: 0.9rem; color: #f1f5f9; margin-top: 0.5rem; line-height: 1.4;">${escapeHtml(r.notes || 'No details provided.')}</p>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #94a3b8; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05);">
        <span>📍 ${escapeHtml(r.location || (r.lat && r.lng ? `${r.lat}, ${r.lng}` : 'Unknown'))}</span>
        <span>🕒 ${escapeHtml(r.timestamp ? new Date(r.timestamp).toLocaleString() : 'Recent')}</span>
      </div>
    </div>
  `).join('');
}

function fillReportLocation() {
  const locInput = document.getElementById('repLoc');
  if (!locInput) return;

  if (currentPos) {
    locInput.value = `${currentPos[0].toFixed(5)}, ${currentPos[1].toFixed(5)}`;
    showToast('GPS coordinates inserted');
  } else if (navigator.geolocation) {
    showToast('Requesting GPS for incident tagging…');
    navigator.geolocation.getCurrentPosition(
      p => {
        currentPos = [p.coords.latitude, p.coords.longitude];
        locInput.value = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
        showToast('GPS coordinates acquired');
      },
      err => showToast(`Location retrieval failed: ${err.message}`, 'error')
    );
  } else {
    showToast('GPS unavailable on this browser', 'error');
  }
}

async function saveSosReport(e) {
  if (e) e.preventDefault();
  const typeEl = document.getElementById('repType');
  const locEl = document.getElementById('repLoc');
  const notesEl = document.getElementById('repNotes');

  const locVal = locEl ? locEl.value.trim() : '';
  let lat = 28.6139;
  let lng = 77.2090;

  if (locVal.includes(',')) {
    const parts = locVal.split(',').map(s => parseFloat(s.trim()));
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      lat = parts[0];
      lng = parts[1];
    }
  } else if (currentPos) {
    lat = currentPos[0];
    lng = currentPos[1];
  }

  const payload = {
    id: 'INC-' + Date.now().toString().slice(-6),
    timestamp: new Date().toISOString(),
    type: typeEl ? typeEl.value : 'Suspicious Activity',
    lat,
    lng,
    location: locVal || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    notes: notesEl ? notesEl.value.trim() : 'Incident logged.'
  };

  // 1. Try Backend
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      await fetch(`${window.riskClient.apiBase}/api/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {}
  }

  // 2. Update local storage
  const reports = JSON.parse(localStorage.getItem(INCIDENTS_CACHE_KEY) || '[]');
  reports.unshift(payload);
  localStorage.setItem(INCIDENTS_CACHE_KEY, JSON.stringify(reports));

  if (e && e.target) e.target.reset();
  loadReports();
  showToast('Incident report recorded into safety database');
}

async function deleteReport(id) {
  if (window.riskClient && window.riskClient.backendAvailable) {
    try {
      await fetch(`${window.riskClient.apiBase}/api/incidents/${id}`, { method: 'DELETE' });
    } catch {}
  }

  let reports = JSON.parse(localStorage.getItem(INCIDENTS_CACHE_KEY) || '[]');
  reports = reports.filter((r, idx) => r.id !== id && String(idx) !== String(id));
  localStorage.setItem(INCIDENTS_CACHE_KEY, JSON.stringify(reports));
  loadReports();
  showToast('Report deleted');
}

function exportReports() {
  const reports = JSON.parse(localStorage.getItem(INCIDENTS_CACHE_KEY) || '[]');
  if (!reports.length) {
    showToast('No reports available to export', 'error');
    return;
  }
  const blob = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SafeRoute_Security_Incident_Reports_${Date.now()}.json`;
  a.click();
  showToast('Reports downloaded as JSON archive');
}
