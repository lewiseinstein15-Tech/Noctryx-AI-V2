import { applyCors, rateLimit, clientKey } from './_utils.js';
import { chatWithFallback } from './_providers.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!rateLimit(`chat:${clientKey(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: 'Too many requests — wait a moment and try again.' });
  }

  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message (string) is required' });
    }

    const messages = [
      {
        role: 'system',
        content: 'You are Noctryx, a concise, direct AI assistant embedded in the Noctryx AI V2 app. Keep answers helpful and to the point. Use markdown code fences for code.'
      },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: 'user', content: message }
    ];

    const result = await chatWithFallback(messages);
    res.status(200).json(result);
  } catch (err) {
    console.error('[chat] error:', err.message);
    res.status(502).json({ error: err.message });
  }
}