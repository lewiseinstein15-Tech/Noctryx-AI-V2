import { applyCors } from './_utils.js';
import { PROVIDERS, FALLBACK_ORDER } from './_providers.js';

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  // Build an array of enabled provider names (strings)
  const enabledProviders = FALLBACK_ORDER.filter(key => PROVIDERS[key]?.enabled);

  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    providers: enabledProviders   // ✅ Now an array, e.g. ['cerebras', 'openrouter']
  });
}
