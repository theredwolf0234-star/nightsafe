module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const data = req.body || {};
  const report = {
    id: 'SOS-' + Date.now().toString().slice(-6),
    type: data.type || 'Emergency Panic Button Triggered',
    severity: 'critical',
    lat: data.lat || 28.6139,
    lng: data.lng || 77.2090,
    timestamp: new Date().toISOString(),
    status: 'DISPATCHED_TO_EMERGENCY_CONTACTS'
  };

  return res.status(201).json({ success: true, report });
};
