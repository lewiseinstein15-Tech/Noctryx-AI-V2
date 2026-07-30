import { applyCors, rateLimit, clientKey } from './_utils.js';
import { PROVIDERS } from './_providers.js';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!rateLimit(`vision:${clientKey(req)}`, 10, 60_000)) {
    return res.status(429).json({ error: 'Too many requests — wait a moment and try again.' });
  }

  try {
    const { imageBase64, mimeType, prompt } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    if (!PROVIDERS.gemini.enabled) {
      return res.status(503).json({ error: 'Vision requires GEMINI_API_KEY to be set in Vercel project settings.' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDERS.gemini.model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt || 'Describe what is visible in this image in 2-3 concise sentences. Then list any distinct objects you can identify, one per line.' },
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
    };

    const geminiRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      throw new Error(`gemini vision HTTP ${geminiRes.status}: ${errText.slice(0, 300)}`);
    }

    const data = await geminiRes.json();
    const analysis = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!analysis) throw new Error('gemini vision returned no content');

    res.status(200).json({ analysis, provider: 'gemini' });
  } catch (err) {
    console.error('[vision] error:', err.message);
    res.status(502).json({ error: err.message });
  }
}