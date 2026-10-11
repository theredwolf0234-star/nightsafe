const fs = require('fs');
const path = require('path');
const { AIRiskEngine } = require('../../backend/ai_risk_engine/risk_engine');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let safeHavens = [];
  let incidents = [];
  try {
    const havensPath = path.join(process.cwd(), 'backend', 'data', 'safe_havens.json');
    const incsPath = path.join(process.cwd(), 'backend', 'data', 'incidents.json');
    if (fs.existsSync(havensPath)) safeHavens = JSON.parse(fs.readFileSync(havensPath, 'utf-8'));
    if (fs.existsSync(incsPath)) incidents = JSON.parse(fs.readFileSync(incsPath, 'utf-8'));
  } catch (e) {}

  const riskEngine = new AIRiskEngine({ safeHavens, incidents });
  const data = req.body || {};
  const routes = data.routes || [];
  const departureTime = data.departure_time || '23:00';
  const mode = data.mode || 'driving';

  const evaluated = routes.map((r, i) => riskEngine.evaluateRoute(r, i, departureTime, mode));
  const comparison = riskEngine.compareRoutesAnalysis(evaluated);
  return res.status(200).json({ success: true, evaluated_routes: evaluated, comparison });
};
