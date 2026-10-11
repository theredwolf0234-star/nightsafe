const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const dataPath = path.join(process.cwd(), 'backend', 'data', 'incidents.json');
  let list = [];
  try {
    if (fs.existsSync(dataPath)) {
      list = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    }
  } catch (err) {}

  if (req.method === 'POST') {
    const data = req.body || {};
    const report = {
      id: (data.type && data.type.includes('SOS') ? 'SOS-' : 'INC-') + Date.now().toString().slice(-6),
      type: data.type || 'Panic / SOS Triggered',
      severity: 'high',
      weight: 0.9,
      lat: data.lat || 28.6139,
      lng: data.lng || 77.2090,
      location: data.location || '28.6139, 77.2090',
      timestamp: new Date().toISOString(),
      notes: data.notes || 'Emergency triggered.'
    };
    list.unshift(report);
    return res.status(201).json({ success: true, report });
  }

  res.status(200).json({ success: true, count: list.length, incidents: list });
};
