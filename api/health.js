// api/health.js - CommonJS version (no import/export)
module.exports = function(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Return health status
  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    providers: ['cerebras', 'groq', 'openrouter', 'gemini']
  });
};