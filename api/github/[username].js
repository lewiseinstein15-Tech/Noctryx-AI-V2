import { applyCors, rateLimit, clientKey } from '../_utils.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!rateLimit(`github:${clientKey(req)}`, 30, 60_000)) {
    return res.status(429).json({ error: 'Too many requests — wait a moment and try again.' });
  }

  try {
    const { username } = req.query;
    const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'noctryx-ai' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;

    const ghRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=10`,
      { headers }
    );

    if (!ghRes.ok) {
      const errText = await ghRes.text().catch(() => '');
      return res.status(ghRes.status).json({ error: `GitHub API HTTP ${ghRes.status}: ${errText.slice(0, 200)}` });
    }

    const repos = await ghRes.json();
    res.status(200).json(repos.map(r => ({
      name: r.name,
      description: r.description,
      private: r.private,
      updated_at: r.updated_at,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      html_url: r.html_url
    })));
  } catch (err) {
    console.error('[github] error:', err.message);
    res.status(502).json({ error: err.message });
  }
}