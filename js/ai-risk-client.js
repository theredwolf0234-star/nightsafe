/**
 * SafeRoute.AI - Frontend AI Risk Engine Client
 * Bridges frontend UI to backend REST API with seamless local standalone fallback.
 */

class SafeRouteRiskClient {
  constructor() {
    this.apiBase = window.location.origin.includes('http') ? window.location.origin : 'http://localhost:5000';
    this.backendAvailable = false;
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
    try {
      const resp = await fetch(`${this.apiBase}/api/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        this.backendAvailable = true;
        if (badge) {
          badge.innerHTML = `<span class="badge-dot"></span> AI Backend: Active`;
          badge.title = 'Connected to Python / Node REST API server';
        }
        return true;
      }
    } catch (e) {
      // Backend not running on this port
    }

    this.backendAvailable = false;
    if (badge) {
      badge.innerHTML = `<span class="badge-dot offline"></span> AI Engine: Local Standalone`;
      badge.title = 'Running on client-side AI risk engine (Start server for full persistence)';
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
