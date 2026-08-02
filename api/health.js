export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  res.status(200).json({ ok: true, name: 'Jexi', status: 'sassy and operational', time: new Date().toISOString() });
}
