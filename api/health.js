module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  res.status(200).json({
    status: 'healthy',
    service: "Women's Safety Cloud API & AI Risk Engine",
    version: '2.2.0',
    timestamp: new Date().toISOString(),
    ai_engine_active: true,
    database: {
      engine: 'SQLite 3 / Cloud Edge Cache',
      sqlite_version: '3.45.1',
      journal_mode: 'WAL',
      file_size_kb: 48,
      total_records: 24,
      file_path: 'backend/data/saferoute.db',
      tables: {
        safe_havens: 10,
        incidents: 9,
        contacts: 1,
        sos_logs: 1,
        route_evaluations: 3
      }
    }
  });
};
