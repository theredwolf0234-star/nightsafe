const http = require('http');
const fs = require('fs');
const path = require('path');
const { AIRiskEngine } = require('./ai_risk_engine/risk_engine');

const PORT = process.env.PORT || 5000;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');

function readJson(filename, fallback = []) {
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.error(`Error reading ${filename}:`, e.message);
    }
  }
  return fallback;
}

function writeJson(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const safeHavens = readJson('safe_havens.json', []);
const incidents = readJson('incidents.json', []);
const riskEngine = new AIRiskEngine({ safeHavens, incidents });

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  const sendJson = (data, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  // API Routes
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson({ status: 'healthy', runtime: 'Node.js', ai_engine_active: true });
  }

  if (req.method === 'GET' && pathname === '/api/config') {
    return sendJson({ mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || '' });
  }

  if (req.method === 'GET' && pathname === '/api/safe-havens') {
    return sendJson({ success: true, count: safeHavens.length, safe_havens: safeHavens });
  }

  if (req.method === 'GET' && pathname === '/api/incidents') {
    return sendJson({ success: true, count: incidents.length, incidents: readJson('incidents.json', []) });
  }

  if (req.method === 'GET' && pathname === '/api/contacts') {
    return sendJson({ success: true, contacts: readJson('contacts.json', []) });
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(body); } catch {}

      if (pathname === '/api/risk/evaluate') {
        const routes = data.routes || [];
        const departureTime = data.departure_time || '23:00';
        const mode = data.mode || 'driving';

        const evaluated = routes.map((r, i) => riskEngine.evaluateRoute(r, i, departureTime, mode));
        const comparison = riskEngine.compareRoutesAnalysis(evaluated);
        return sendJson({ success: true, evaluated_routes: evaluated, comparison });
      }

      if (pathname === '/api/contacts') {
        const list = readJson('contacts.json', []);
        const newC = {
          id: 'c-' + Date.now().toString().slice(-6),
          name: data.name,
          phone: data.phone,
          rel: data.rel || 'Family',
          isPrimary: list.length === 0
        };
        list.push(newC);
        writeJson('contacts.json', list);
        return sendJson({ success: true, contact: newC, contacts: list }, 201);
      }

      if (pathname === '/api/incidents' || pathname === '/api/sos/trigger') {
        const list = readJson('incidents.json', []);
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
        writeJson('incidents.json', list);
        return sendJson({ success: true, report }, 201);
      }

      sendJson({ error: 'Endpoint not found' }, 404);
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(ROOT_DIR, pathname === '/' ? 'index.html' : pathname);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(ROOT_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SafeRoute.AI] Node.js server running on http://0.0.0.0:${PORT}`);
});
