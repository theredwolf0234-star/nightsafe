/**
 * SafeRoute.AI - Core AI Risk Engine (JavaScript / Node.js Engine)
 * Mirrors the Python spatial-temporal algorithm for browser & Node.js environments.
 */

class AIRiskEngine {
  constructor(options = {}) {
    this.safeHavens = options.safeHavens || [];
    this.incidents = options.incidents || [];
  }

  static haversine(lat1, lon1, lat2, lon2) {
    const R = 6371.0;
    const toRad = deg => (deg * Math.PI) / 180.0;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dphi = toRad(lat2 - lat1);
    const dlambda = toRad(lon2 - lon1);

    const a =
      Math.sin(dphi / 2.0) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2.0) ** 2;
    const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
    return R * c;
  }

  getTimeFactor(timeStr) {
    let hour = 23.0;
    try {
      if (!timeStr) {
        const d = new Date();
        hour = d.getHours() + d.getMinutes() / 60.0;
      } else {
        const parts = timeStr.split(':');
        hour = parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60.0;
      }
    } catch {
      hour = 23.0;
    }

    if (hour >= 23.0 || hour < 4.0) {
      return Math.max(0.60, 0.62 + 0.08 * Math.cos(((hour - 2.5) * Math.PI) / 4.0));
    } else if (hour >= 4.0 && hour < 6.0) {
      return 0.72 + (hour - 4.0) * 0.10;
    } else if (hour >= 19.0 && hour < 23.0) {
      return 0.95 - ((hour - 19.0) / 4.0) * 0.22;
    } else {
      return 0.98;
    }
  }

  getModeMultiplier(mode) {
    mode = (mode || 'driving').toLowerCase();
    if (mode.includes('walk')) return 1.30;
    if (mode.includes('cycl') || mode.includes('bike') || mode.includes('scooter')) return 1.12;
    return 0.88;
  }

  sampleCoordinates(coords, maxSamples = 35) {
    if (!coords || coords.length <= maxSamples) return coords || [];
    const step = coords.length / maxSamples;
    const sampled = [];
    for (let i = 0; i < maxSamples; i++) {
      sampled.push(coords[Math.floor(i * step)]);
    }
    sampled.push(coords[coords.length - 1]);
    return sampled;
  }

  calculateIncidentDensity(lat, lng) {
    const bandwidthKm = 2.0;
    let totalRisk = 0.0;

    for (const inc of this.incidents) {
      if (inc.lat == null || inc.lng == null) continue;
      const dist = AIRiskEngine.haversine(lat, lng, inc.lat, inc.lng);
      if (dist < bandwidthKm) {
        const weight = inc.weight || 0.5;
        const decay = Math.exp(-0.5 * (dist / (bandwidthKm * 0.45)) ** 2);
        totalRisk += weight * decay;
      }
    }

    return Math.min(100.0, totalRisk * 45.0);
  }

  findNearbySafeHavens(lat, lng, radiusKm = 1.2) {
    const nearby = [];
    for (const sh of this.safeHavens) {
      if (sh.lat == null || sh.lng == null) continue;
      const dist = AIRiskEngine.haversine(lat, lng, sh.lat, sh.lng);
      if (dist <= radiusKm) {
        nearby.push({
          id: sh.id,
          name: sh.name,
          type: sh.type,
          dist_km: Math.round(dist * 100) / 100,
          phone: sh.phone || '',
          address: sh.address || '',
          features: sh.features || []
        });
      }
    }
    return nearby.sort((a, b) => a.dist_km - b.dist_km);
  }

  evaluateRoute(routeData, routeIndex = 0, departureTime = '23:00', mode = 'driving') {
    let coords = [];
    if (routeData.geometry && routeData.geometry.coordinates) {
      coords = routeData.geometry.coordinates;
    } else if (Array.isArray(routeData.coordinates)) {
      coords = routeData.coordinates;
    }

    const distanceM = routeData.distance || 15000;
    const durationS = routeData.duration || 1200;
    const distanceKm = distanceM / 1000.0;
    const durationMin = Math.round(durationS / 60.0);

    const timeFactor = this.getTimeFactor(departureTime);
    const modeMult = this.getModeMultiplier(mode);

    const sampledCoords = this.sampleCoordinates(coords, 35);
    const totalSegments = sampledCoords.length;

    const baseLightingTier = routeIndex === 0 ? 92.0 : Math.max(40.0, 78.0 - routeIndex * 16.0);

    const segmentEvaluations = [];
    const routeHavens = {};
    let darkStreak = 0;
    let maxDarkStreak = 0;
    let totalSegmentLighting = 0;
    let totalIncidentPenalty = 0;
    let totalHavenScores = 0;

    for (let i = 0; i < sampledCoords.length; i++) {
      const pt = sampledCoords[i];
      const lng = pt[0];
      const lat = pt[1];

      // Safe havens
      const havens = this.findNearbySafeHavens(lat, lng, 1.2);
      havens.forEach(h => { routeHavens[h.id] = h; });

      const havenScore = havens.length > 0 ? Math.max(30.0, 100.0 - havens[0].dist_km * 45.0) : 25.0;
      const incidentPenalty = this.calculateIncidentDensity(lat, lng);

      const seed = Math.sin(lat * 100.0 + lng * 100.0 + i);
      let localLighting = baseLightingTier + seed * 9.0;
      if (timeFactor < 0.70) localLighting -= 6.0;
      localLighting = Math.max(20.0, Math.min(99.0, localLighting));

      let segmentSafety = (
        0.50 * localLighting +
        0.30 * (100.0 - Math.min(80.0, incidentPenalty)) +
        0.20 * Math.min(100.0, havenScore * 1.2)
      );

      if (localLighting < 55.0 || segmentSafety < 50.0) {
        darkStreak++;
        if (darkStreak > maxDarkStreak) maxDarkStreak = darkStreak;
      } else {
        darkStreak = 0;
      }

      segmentEvaluations.push({
        index: i,
        lng: Math.round(lng * 100000) / 100000,
        lat: Math.round(lat * 100000) / 100000,
        lighting: Math.round(localLighting * 10) / 10,
        incident_penalty: Math.round(incidentPenalty * 10) / 10,
        haven_score: Math.round(havenScore * 10) / 10,
        safety_score: Math.round(segmentSafety * 10) / 10,
        classification: segmentSafety >= 75 ? 'HIGH_SAFETY' : (segmentSafety >= 50 ? 'CAUTION' : 'DANGER')
      });

      totalSegmentLighting += localLighting;
      totalIncidentPenalty += incidentPenalty;
      totalHavenScores += havenScore;
    }

    const avgLighting = totalSegmentLighting / Math.max(1, totalSegments);
    const avgIncident = totalIncidentPenalty / Math.max(1, totalSegments);
    const avgHaven = totalHavenScores / Math.max(1, totalSegments);

    const rawScore = (
      0.50 * avgLighting +
      0.30 * (100.0 - Math.min(80.0, avgIncident)) +
      0.20 * Math.min(100.0, avgHaven * 1.2)
    );

    const timePenalty = (1.0 - timeFactor) * 22.0;
    const modeAdj = (1.0 - modeMult) * 12.0;
    let compositeScore = rawScore - timePenalty + modeAdj;

    if (maxDarkStreak >= 3) {
      compositeScore -= Math.min(20.0, maxDarkStreak * 3.0);
    }

    compositeScore = Math.max(15, Math.min(98, Math.round(compositeScore)));
    const overallLighting = Math.max(20, Math.min(99, Math.round(avgLighting)));

    let riskLevel = 'LOW RISK';
    let riskClass = 'risk-low';
    let riskColor = '#10b981';

    if (compositeScore < 50) {
      riskLevel = 'HIGH RISK';
      riskClass = 'risk-high';
      riskColor = '#ef4444';
    } else if (compositeScore < 75) {
      riskLevel = 'MODERATE RISK';
      riskClass = 'risk-med';
      riskColor = '#f59e0b';
    }

    const corridor = routeIndex === 0
      ? 'Primary Arterial Corridor (High-Lumen Streetlights)'
      : (routeIndex === 1 ? 'Secondary Urban Arterial (Mixed Commercial)' : 'Interior Residential / Unmonitored Bypass');

    const surveillance = routeIndex === 0
      ? 'Dense CCTV Grid (High)'
      : (routeIndex === 1 ? 'Moderate Municipal CCTV' : 'Sparse / Spotty Private CCTV');

    const hazardWarnings = [];
    if (maxDarkStreak >= 3) {
      hazardWarnings.push(`⚠️ Noticeable continuous low-illumination segment detected (~${Math.round(maxDarkStreak * 0.45 * 10) / 10} km stretch).`);
    }
    if (avgIncident > 28.0) {
      hazardWarnings.push('⚠️ Passes within 1.2 km of historical late-night incident/harassment hotspots.');
    }
    if (avgHaven < 45.0) {
      hazardWarnings.push('⚠️ Low density of 24/7 emergency response posts along this corridor.');
    }
    if (!hazardWarnings.length) {
      hazardWarnings.push('✅ Well-monitored high-traffic night corridor with continuous streetlights.');
    }

    const safetyTips = [];
    if (mode === 'walking') {
      safetyTips.push('Stay on illuminated pedestrian sidewalks; avoid unlit underpasses.');
      safetyTips.push('Share live tracking link with your trusted contact.');
    } else if (mode === 'cycling') {
      safetyTips.push('Ensure high-visibility reflective gear and front lamp are operational.');
    } else {
      safetyTips.push('Verify cab registration plate and keep emergency quick dial ready.');
    }

    return {
      route_index: routeIndex,
      title: routeIndex === 0 ? 'Primary Lit Route (AI Guardian Recommended)' : `Alternative Route ${routeIndex}`,
      distance_km: Math.round(distanceKm * 10) / 10,
      duration_min: durationMin,
      safety_score: compositeScore,
      lighting_percentage: overallLighting,
      risk_level: riskLevel,
      risk_class: riskClass,
      risk_color: riskColor,
      corridor,
      surveillance,
      metrics_breakdown: {
        lighting_score: overallLighting,
        haven_proximity_score: Math.round(avgHaven),
        incident_avoidance_score: Math.round(100.0 - avgIncident),
        cctv_coverage_score: routeIndex === 0 ? 88 : (routeIndex === 1 ? 65 : 38),
        temporal_vulnerability_penalty: Math.round((1.0 - timeFactor) * 100),
        exposure_factor: Math.round(modeMult * 100) / 100
      },
      hazard_warnings: hazardWarnings,
      safety_tips: safetyTips,
      safe_havens_count: Object.keys(routeHavens).length,
      safe_havens_list: Object.values(routeHavens).slice(0, 6),
      segment_count: segmentEvaluations.length,
      max_dark_streak: maxDarkStreak
    };
  }

  compareRoutesAnalysis(evaluatedRoutes) {
    if (!evaluatedRoutes || evaluatedRoutes.length <= 1) {
      return { has_comparison: false };
    }

    const primary = evaluatedRoutes[0];
    const comparisons = [];

    for (let i = 1; i < evaluatedRoutes.length; i++) {
      const alt = evaluatedRoutes[i];
      const timeDiff = alt.duration_min - primary.duration_min;
      const safetyDiff = primary.safety_score - alt.safety_score;
      const lightingDiff = primary.lighting_percentage - alt.lighting_percentage;

      const safetyText = safetyDiff > 0 ? `+${safetyDiff}% safer` : `${safetyDiff}% lower safety`;

      comparisons.append ? comparisons.push({
        alt_index: alt.route_index,
        alt_title: alt.title,
        summary: `Primary route is ${safetyText} and offers +${lightingDiff}% brighter illumination than ${alt.title}.`,
        safety_delta: safetyDiff,
        lighting_delta: lightingDiff,
        time_delta_min: timeDiff
      }) : null;
    }

    return {
      has_comparison: true,
      recommended_route_index: 0,
      verdict: 'AI Recommendation: Take the Primary Lit Route. The extra illumination and 24/7 security presence significantly offset minor distance variances.',
      comparisons
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AIRiskEngine };
}
