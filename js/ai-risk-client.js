/**
 * SafeRoute.AI - Frontend AI Risk Engine Client & SQLite Database Bridge
 * Connects frontend UI to backend REST API + SQLite relational database with seamless local standalone fallback.
 */

class SafeRouteRiskClient {
  constructor() {
    this.apiBase = window.location.origin.includes('http') ? window.location.origin : 'http://localhost:5000';
    this.backendAvailable = false;
    this.dbStats = null;
    this.localEngine = null;
    this.init();
  }

  async init() {
    await this.checkBackendStatus();
    // Initialize client fallback engine if needed
    if (typeof AIRiskEngine !== 'undefined') {
      const defaultHavens = [
        { id: "SH-101", name: "Connaught Place Police Station & 24/7 Booth", lat: 28.6315, lng: 77.2167, type: "police" },
        { id: "SH-102", name: "RML Hospital (24/7 Emergency)", lat: 28.6247, lng: 77.2023, type: "hospital" },
        { id: "SH-103", name: "AIIMS Emergency & Trauma Centre", lat: 28.5672, lng: 77.2100, type: "hospital" },
        { id: "SH-104", name: "Hauz Khas Police Station", lat: 28.5494, lng: 77.2001, type: "police" },
        { id: "SH-105", name: "Apollo Pharmacy 24/7", lat: 28.5726, lng: 77.2215, type: "pharmacy_247" },
        { id: "SH-106", name: "Rajiv Chowk Metro Security", lat: 28.6328, lng: 77.2195, type: "transit_hub" },
        { id: "SH-107", name: "Noida Sector 18 Police Post", lat: 28.5708, lng: 77.3208, type: "police" },
        { id: "SH-108", name: "Max Hospital Saket", lat: 28.5283, lng: 77.2135, type: "hospital" }
      ];

      const defaultIncidents = [
        { id: "INC-1", lat: 28.5244, lng: 77.2100, weight: 0.65, type: "Unlit Streetlights" },
        { id: "INC-2", lat: 28.5900, lng: 77.0800, weight: 0.85, type: "Suspicious Activity" },
        { id: "INC-3", lat: 28.6500, lng: 77.1800, weight: 0.90, type: "Harassment" },
        { id: "INC-4", lat: 28.6304, lng: 77.2295, weight: 0.95, type: "SOS Triggered" },
        { id: "INC-5", lat: 28.5800, lng: 77.2500, weight: 0.60, type: "Unlit Lane" }
      ];

      this.localEngine = new AIRiskEngine({
        safeHavens: defaultHavens,
        incidents: defaultIncidents
      });
    }
  }

  async checkBackendStatus() {
    const badge = document.getElementById('backendStatusBadge');
    const dbBadge = document.getElementById('dbStatusBadge');
    try {
      const resp = await fetch(`${this.apiBase}/api/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const data = await resp.json();
        this.backendAvailable = true;
        this.dbStats = data.database || null;
        window.dbStats = this.dbStats;

        if (badge) {
          badge.innerHTML = `<span class="badge-dot"></span> AI Backend: Active`;
          badge.title = 'Connected to Python REST API server';
        }
        if (dbBadge && this.dbStats) {
          const recCount = this.dbStats.total_records || 0;
          dbBadge.innerHTML = `<span class="badge-dot" style="background:#38bdf8; box-shadow:0 0 8px #38bdf8;"></span> SQLite DB: Active (${recCount} recs)`;
          dbBadge.title = `SQLite 3 database connected (${this.dbStats.journal_mode} mode, ${this.dbStats.file_size_kb || 0} KB). Click for schema stats.`;
          dbBadge.style.display = 'inline-flex';
        }
        return true;
      }
    } catch (e) {
      // Backend not running on this port
    }

    this.backendAvailable = false;
    this.dbStats = null;
    window.dbStats = null;
    if (badge) {
      badge.innerHTML = `<span class="badge-dot offline"></span> AI Engine: Standalone`;
      badge.title = 'Running on client-side AI risk engine (Start python server for full persistence)';
    }
    if (dbBadge) {
      dbBadge.innerHTML = `<span class="badge-dot offline"></span> SQLite DB: Standalone Cache`;
      dbBadge.title = 'Click to see how to start the native SQLite backend server.';
    }
    return false;
  }

  async evaluateRoutes(routes, departureTime = '23:00', mode = 'driving') {
    // 1. Try Backend REST API
    if (this.backendAvailable) {
      try {
        const resp = await fetch(`${this.apiBase}/api/risk/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routes, departure_time: departureTime, mode })
        });
        if (resp.ok) {
          const data = await resp.json();
          this.checkBackendStatus();
          return data;
        }
      } catch (err) {
        console.warn('[RiskClient] Backend call failed, falling back to local engine:', err);
      }
    }

    // 2. Local Fallback Engine
    if (this.localEngine) {
      const evaluated = routes.map((r, i) => this.localEngine.evaluateRoute(r, i, departureTime, mode));
      const comparison = this.localEngine.compareRoutesAnalysis(evaluated);
      return {
        success: true,
        evaluated_routes: evaluated,
        comparison,
        is_local_evaluation: true
      };
    }

    throw new Error('AI Risk Engine not available.');
  }

  async assessPointSafety(lat, lng) {
    if (this.backendAvailable) {
      try {
        const resp = await fetch(`${this.apiBase}/api/risk/point`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng })
        });
        if (resp.ok) return await resp.json();
      } catch {}
    }

    // Fallback calculation
    if (this.localEngine) {
      const havens = this.localEngine.findNearbySafeHavens(lat, lng, 1.5);
      const inc = this.localEngine.calculateIncidentDensity(lat, lng);
      return {
        success: true,
        safety_score: Math.max(20, Math.min(98, Math.round(85 - inc * 0.5 + havens.length * 4))),
        danger_zone: inc > 35,
        nearest_havens: havens.slice(0, 3)
      };
    }

    return { success: false, safety_score: 75 };
  }
}

// Global instance
window.riskClient = new SafeRouteRiskClient();

// Interactive Database Inspection Functions
function openDbStatusModal() {
  const modal = document.getElementById('dbModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderDbModalContent();
}

function closeDbStatusModal() {
  const modal = document.getElementById('dbModal');
  if (modal) modal.classList.add('hidden');
}

async function refreshDbModal() {
  if (window.riskClient) {
    await window.riskClient.checkBackendStatus();
    renderDbModalContent();
    if (typeof showToast === 'function') showToast('Database metrics refreshed');
  }
}

function renderDbModalContent() {
  const bodyEl = document.getElementById('dbModalBody');
  if (!bodyEl) return;
  const stats = window.dbStats;
  if (!stats) {
    bodyEl.innerHTML = `
      <div style="background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 12px; padding: 1rem; color: #fbbf24; text-align: left;">
        <h4 style="font-weight: 800; font-size: 1rem; margin-bottom: 0.5rem;">⚠️ Python Server Offline</h4>
        <p style="font-size: 0.85rem; line-height: 1.5; color: #cbd5e1;">
          Women's Safety comes with an embedded, zero-dependency <b>SQLite 3 relational database</b> (<code>backend/data/saferoute.db</code>).
        </p>
        <p style="font-size: 0.85rem; line-height: 1.5; color: #cbd5e1; margin-top: 0.5rem;">
          To start the database server, run this in your terminal:
        </p>
        <pre style="background: rgba(0,0,0,0.5); padding: 0.5rem 0.75rem; border-radius: 6px; margin: 0.75rem 0; font-size: 0.82rem; color: #38bdf8; font-family: monospace;">python backend/server.py 5000</pre>
        <p style="font-size: 0.8rem; color: #94a3b8;">Currently serving from browser offline memory.</p>
      </div>
    `;
    return;
  }

  const tables = stats.tables || {};
  bodyEl.innerHTML = `
    <div style="text-align: left; display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
        <div class="card" style="padding: 0.75rem 1rem;">
          <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Database Engine</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #38bdf8;">${stats.engine} v${stats.sqlite_version || ''}</div>
          <div style="font-size: 0.75rem; color: #10b981;">ACID Compliant • ${stats.journal_mode} Mode</div>
        </div>
        <div class="card" style="padding: 0.75rem 1rem;">
          <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Database Size</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #f1f5f9;">${stats.file_size_kb || 0} KB</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">${stats.total_records || 0} total records stored</div>
        </div>
      </div>

      <div class="card" style="padding: 0.75rem 1rem;">
        <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.25rem;">Storage Database File</div>
        <code style="font-size: 0.8rem; color: #a5f3fc; word-break: break-all;">${stats.file_path || 'backend/data/saferoute.db'}</code>
      </div>

      <div>
        <h4 style="font-size: 0.9rem; font-weight: 800; margin-bottom: 0.6rem; color: #f8fafc;">Relational Tables &amp; Record Counts</h4>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">🛡️ <b>safe_havens</b> <span style="font-size: 0.75rem; color: #94a3b8;">(Police, Hospitals, Pharmacies)</span></span>
            <span style="font-size: 0.85rem; font-weight: 800; color: #34d399;">${tables.safe_havens || 0} rows</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">⚠️ <b>incidents</b> <span style="font-size: 0.75rem; color: #94a3b8;">(Lighting, Hazards, Night crime)</span></span>
            <span style="font-size: 0.85rem; font-weight: 800; color: #fbbf24;">${tables.incidents || 0} rows</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">👥 <b>contacts</b> <span style="font-size: 0.75rem; color: #94a3b8;">(Trusted Emergency Guardians)</span></span>
            <span style="font-size: 0.85rem; font-weight: 800; color: #38bdf8;">${tables.contacts || 0} rows</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">🚨 <b>sos_logs</b> <span style="font-size: 0.75rem; color: #94a3b8;">(Emergency SOS Audit Logs)</span></span>
            <span style="font-size: 0.85rem; font-weight: 800; color: #f87171;">${tables.sos_logs || 0} rows</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <span style="font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">🗺️ <b>route_evaluations</b> <span style="font-size: 0.75rem; color: #94a3b8;">(AI Risk Journey Analysis)</span></span>
            <span style="font-size: 0.85rem; font-weight: 800; color: #c084fc;">${tables.route_evaluations || 0} rows</span>
          </div>
        </div>
      </div>
    </div>
  `;
}
