const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const dataPath = path.join(process.cwd(), 'backend', 'data', 'contacts.json');
  let list = [];
  try {
    if (fs.existsSync(dataPath)) {
      list = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    }
  } catch (err) {}

  if (req.method === 'POST') {
    const data = req.body || {};
    const newC = {
      id: 'c-' + Date.now().toString().slice(-6),
      name: data.name,
      phone: data.phone,
      rel: data.rel || 'Family',
      isPrimary: list.length === 0
    };
    list.push(newC);
    return res.status(201).json({ success: true, contact: newC, contacts: list });
  }

  res.status(200).json({ success: true, contacts: list });
};
