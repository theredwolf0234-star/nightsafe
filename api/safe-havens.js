const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const dataPath = path.join(process.cwd(), 'backend', 'data', 'safe_havens.json');
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      return res.status(200).json({ success: true, count: data.length, safe_havens: data });
    }
  } catch (err) {}

  res.status(200).json({ success: true, count: 0, safe_havens: [] });
};
