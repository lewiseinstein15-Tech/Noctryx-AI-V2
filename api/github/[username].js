export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

  const username = req.query.username || req.url.split('/').pop();
  if (!username) { res.status(400).json({ error: 'Username required' }); return; }

  try {
    const headers = {};
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=10`, { headers });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const repos = await r.json();
    res.status(200).json({ repos });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
